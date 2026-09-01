"""A minimal PDF writer, from bytes up.

No dependency renders these atlases: this module speaks PDF 1.4
directly — object table, cross-reference index, Flate-compressed
content streams, Type1 base-14 text with measured advance widths, raw
RGB image XObjects for the shaded-relief underlay, and ExtGState alpha
for washes and glows. Output is deterministic: the same world produces
byte-identical files (no timestamps, no random IDs).
"""

import zlib

from .fontmetrics import WIDTHS

__all__ = ["PDF", "Page", "measure"]

FONTS = list(WIDTHS.keys())


def measure(text, font, size):
    """Width of a string in points (WinAnsi codepage)."""
    table = WIDTHS[font]
    total = 0
    for ch in text:
        try:
            code = ch.encode("cp1252")[0]
        except UnicodeEncodeError:
            code = ord("?")
        if 32 <= code <= 255:
            w = table[code - 32]
            total += w if w else 500
        else:
            total += 500
    return total * size / 1000.0


def _esc(text):
    """Encode a string for a PDF literal in WinAnsi with escapes."""
    out = []
    for ch in text:
        try:
            code = ch.encode("cp1252")[0]
        except UnicodeEncodeError:
            out.append("?")
            continue
        if ch in "()\\":
            out.append("\\" + ch)
        elif 32 <= code <= 126:
            out.append(ch)
        elif code >= 32:
            out.append(f"\\{code:03o}")
        else:
            out.append(" ")
    return "".join(out)


def _num(v):
    if isinstance(v, float):
        s = f"{v:.3f}".rstrip("0").rstrip(".")
        return s if s else "0"
    return str(v)


class Page:
    def __init__(self, pdf, width, height):
        self.pdf = pdf
        self.width = width
        self.height = height
        self._ops = []
        self.fonts_used = set()
        self.images_used = set()
        self.alphas_used = set()

    # -- graphics state ------------------------------------------------
    def save(self):
        self._ops.append("q")

    def restore(self):
        self._ops.append("Q")

    def alpha(self, a):
        """Set fill+stroke alpha (0..1) via a shared ExtGState."""
        key = int(round(a * 100))
        self.alphas_used.add(key)
        self._ops.append(f"/GS{key} gs")

    def set_fill(self, r, g, b):
        self._ops.append(f"{_num(r)} {_num(g)} {_num(b)} rg")

    def set_stroke(self, r, g, b):
        self._ops.append(f"{_num(r)} {_num(g)} {_num(b)} RG")

    def set_width(self, w):
        self._ops.append(f"{_num(w)} w")

    def set_dash(self, pattern, phase=0):
        arr = " ".join(_num(p) for p in pattern)
        self._ops.append(f"[{arr}] {_num(phase)} d")

    def no_dash(self):
        self._ops.append("[] 0 d")

    def set_cap(self, cap):     # 0 butt, 1 round, 2 square
        self._ops.append(f"{cap} J")

    def set_join(self, join):   # 0 miter, 1 round, 2 bevel
        self._ops.append(f"{join} j")

    # -- paths ---------------------------------------------------------
    def move_to(self, x, y):
        self._ops.append(f"{_num(x)} {_num(y)} m")

    def line_to(self, x, y):
        self._ops.append(f"{_num(x)} {_num(y)} l")

    def curve_to(self, x1, y1, x2, y2, x3, y3):
        self._ops.append(f"{_num(x1)} {_num(y1)} {_num(x2)} {_num(y2)} "
                         f"{_num(x3)} {_num(y3)} c")

    def close(self):
        self._ops.append("h")

    def fill(self, even_odd=False):
        self._ops.append("f*" if even_odd else "f")

    def stroke(self):
        self._ops.append("S")

    def fill_stroke(self):
        self._ops.append("B")

    def clip(self, even_odd=False):
        self._ops.append("W* n" if even_odd else "W n")

    def rect(self, x, y, w, h):
        self._ops.append(f"{_num(x)} {_num(y)} {_num(w)} {_num(h)} re")

    def polyline(self, pts, closed=False):
        self.move_to(*pts[0])
        for p in pts[1:]:
            self.line_to(*p)
        if closed:
            self.close()

    def polygon_fill(self, pts):
        self.polyline(pts, closed=True)
        self.fill()

    # -- text ----------------------------------------------------------
    def text(self, x, y, s, font="Helvetica", size=10, angle=0.0,
             charspace=0.0):
        self.fonts_used.add(font)
        fid = f"F{FONTS.index(font)}"
        ops = ["BT", f"/{fid} {_num(size)} Tf"]
        if charspace:
            ops.append(f"{_num(charspace)} Tc")
        if angle:
            import math
            c, sn = math.cos(angle), math.sin(angle)
            ops.append(f"{_num(c)} {_num(sn)} {_num(-sn)} {_num(c)} "
                       f"{_num(x)} {_num(y)} Tm")
        else:
            ops.append(f"1 0 0 1 {_num(x)} {_num(y)} Tm")
        ops.append(f"({_esc(s)}) Tj")
        if charspace:
            ops.append("0 Tc")
        ops.append("ET")
        self._ops.append("\n".join(ops))

    # -- images --------------------------------------------------------
    def image(self, name, x, y, w, h):
        self.images_used.add(name)
        self._ops.append(f"q {_num(w)} 0 0 {_num(h)} {_num(x)} {_num(y)} cm "
                         f"/{name} Do Q")

    def content(self):
        return "\n".join(self._ops).encode("latin-1")


class PDF:
    def __init__(self, title="Landloom Atlas"):
        self.pages = []
        self.images = {}      # name -> (w, h, compressed rgb)
        self.title = title

    def add_page(self, width=792, height=612):
        page = Page(self, width, height)
        self.pages.append(page)
        return page

    def add_image(self, rgb_bytes, width, height):
        name = f"Im{len(self.images)}"
        self.images[name] = (width, height, zlib.compress(rgb_bytes, 7))
        return name

    def save(self, path):
        with open(path, "wb") as f:
            f.write(self.tobytes())

    def tobytes(self):
        objects = []   # list of bytes, object number = index + 1

        def add(body):
            objects.append(body)
            return len(objects)

        font_ids = {}
        used_fonts = set()
        used_alphas = set()
        for p in self.pages:
            used_fonts |= p.fonts_used
            used_alphas |= p.alphas_used
        for fname in FONTS:
            if fname in used_fonts:
                font_ids[fname] = add(
                    f"<< /Type /Font /Subtype /Type1 /BaseFont /{fname} "
                    f"/Encoding /WinAnsiEncoding >>".encode())

        image_ids = {}
        for name, (w, h, data) in self.images.items():
            body = (f"<< /Type /XObject /Subtype /Image /Width {w} "
                    f"/Height {h} /ColorSpace /DeviceRGB "
                    f"/BitsPerComponent 8 /Filter /FlateDecode "
                    f"/Length {len(data)} >>\nstream\n").encode() \
                + data + b"\nendstream"
            image_ids[name] = add(body)

        gs_ids = {}
        for key in sorted(used_alphas):
            a = key / 100.0
            gs_ids[key] = add(
                f"<< /Type /ExtGState /ca {_num(a)} /CA {_num(a)} >>".encode())

        page_obj_ids = []
        pages_tree_id_placeholder = None
        content_ids = []
        for p in self.pages:
            data = zlib.compress(p.content(), 7)
            cid = add(f"<< /Length {len(data)} /Filter /FlateDecode >>"
                      f"\nstream\n".encode() + data + b"\nendstream")
            content_ids.append(cid)

        # build resource dicts and page objects (pages tree comes after,
        # so reserve its object number now)
        pages_tree_id = len(objects) + len(self.pages) + 1
        for idx, p in enumerate(self.pages):
            res = []
            if p.fonts_used:
                fonts = " ".join(f"/F{FONTS.index(fn)} {font_ids[fn]} 0 R"
                                 for fn in sorted(p.fonts_used))
                res.append(f"/Font << {fonts} >>")
            if p.images_used:
                xo = " ".join(f"/{nm} {image_ids[nm]} 0 R"
                              for nm in sorted(p.images_used))
                res.append(f"/XObject << {xo} >>")
            if p.alphas_used:
                gs = " ".join(f"/GS{k} {gs_ids[k]} 0 R"
                              for k in sorted(p.alphas_used))
                res.append(f"/ExtGState << {gs} >>")
            body = (f"<< /Type /Page /Parent {pages_tree_id} 0 R "
                    f"/MediaBox [0 0 {_num(p.width)} {_num(p.height)}] "
                    f"/Contents {content_ids[idx]} 0 R "
                    f"/Resources << {' '.join(res)} >> >>")
            page_obj_ids.append(add(body.encode()))

        kids = " ".join(f"{pid} 0 R" for pid in page_obj_ids)
        tree_id = add(f"<< /Type /Pages /Kids [{kids}] "
                      f"/Count {len(page_obj_ids)} >>".encode())
        assert tree_id == pages_tree_id

        catalog_id = add(f"<< /Type /Catalog /Pages {tree_id} 0 R >>".encode())
        info_id = add(f"<< /Title ({_esc(self.title)}) "
                      f"/Producer (Landloom) >>".encode())

        out = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
        offsets = [0]
        for num, body in enumerate(objects, start=1):
            offsets.append(len(out))
            out += f"{num} 0 obj\n".encode()
            out += body if isinstance(body, bytes) else body.encode()
            out += b"\nendobj\n"
        xref_pos = len(out)
        out += f"xref\n0 {len(objects) + 1}\n".encode()
        out += b"0000000000 65535 f \n"
        for off in offsets[1:]:
            out += f"{off:010d} 00000 n \n".encode()
        out += (f"trailer\n<< /Size {len(objects) + 1} "
                f"/Root {catalog_id} 0 R /Info {info_id} 0 R >>\n"
                f"startxref\n{xref_pos}\n%%EOF\n").encode()
        return bytes(out)
