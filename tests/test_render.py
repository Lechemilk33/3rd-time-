"""Rendering pipeline invariants: valid PDF structure, determinism,
labels inside the frame."""

import re
import sys
import unittest
import zlib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from landloom import world as world_mod
from landloom.gazetteer import render_gazetteer
from landloom.labels import place_labels
from landloom.pdfout import PDF
from landloom.render import MapRenderer
from landloom.rng import Streams

PHRASE = "The Salt Reaches"
_CACHE = {}


def atlas_bytes():
    if "pdf" not in _CACHE:
        w = world_mod.weave(PHRASE, width=150, height=115, quality="fast")
        pdf = PDF(title=PHRASE)
        MapRenderer(w).render(pdf, Streams(PHRASE))
        render_gazetteer(pdf, w)
        _CACHE["pdf"] = pdf.tobytes()
        _CACHE["world"] = w
    return _CACHE["pdf"]


class TestPDFStructure(unittest.TestCase):
    def test_header_and_eof(self):
        data = atlas_bytes()
        self.assertTrue(data.startswith(b"%PDF-1.4"))
        self.assertTrue(data.rstrip().endswith(b"%%EOF"))

    def test_xref_offsets_point_at_objects(self):
        data = atlas_bytes()
        m = re.search(rb"startxref\n(\d+)\n%%EOF", data)
        self.assertIsNotNone(m)
        xref_pos = int(m.group(1))
        self.assertEqual(data[xref_pos:xref_pos + 4], b"xref")
        table = data[xref_pos:]
        count = int(re.search(rb"xref\n0 (\d+)", table).group(1))
        entries = re.findall(rb"(\d{10}) 00000 n", table)
        self.assertEqual(len(entries), count - 1)
        for num, off in enumerate(entries, start=1):
            offset = int(off)
            expect = f"{num} 0 obj".encode()
            self.assertEqual(data[offset:offset + len(expect)], expect,
                             f"object {num} not at its xref offset")

    def test_content_streams_decompress(self):
        data = atlas_bytes()
        streams = re.findall(
            rb"/FlateDecode\s*/Length \d+ >>\nstream\n(.*?)\nendstream",
            data, re.S)
        # page content streams (images use a different dict ordering)
        found = 0
        for blob in streams:
            try:
                zlib.decompress(blob)
                found += 1
            except zlib.error:
                pass
        self.assertGreater(found, 0)

    def test_deterministic_bytes(self):
        a = atlas_bytes()
        w = world_mod.weave(PHRASE, width=150, height=115, quality="fast")
        pdf = PDF(title=PHRASE)
        MapRenderer(w).render(pdf, Streams(PHRASE))
        render_gazetteer(pdf, w)
        self.assertEqual(a, pdf.tobytes())


class TestLabels(unittest.TestCase):
    def test_labels_stay_inside_frame(self):
        atlas_bytes()
        w = _CACHE["world"]
        r = MapRenderer(w)
        r._plan_furniture()
        items = r._build_labels()
        bounds = (r.mx0 + 3, r.my0 + 3, r.mx0 + r.map_w - 3,
                  r.my0 + r.map_h - 3)
        place_labels(items, bounds, Streams(PHRASE).fork("labels"))
        slack = 8.0
        for it in items:
            if it.hidden:
                continue
            b = it.boxes()[it.chosen]
            self.assertGreater(b[0], bounds[0] - slack, it.text)
            self.assertLess(b[2], bounds[2] + slack, it.text)
            self.assertGreater(b[1], bounds[1] - slack, it.text)
            self.assertLess(b[3], bounds[3] + slack, it.text)

    def test_mandatory_labels_not_hidden(self):
        atlas_bytes()
        w = _CACHE["world"]
        r = MapRenderer(w)
        r._plan_furniture()
        items = r._build_labels()
        place_labels(items, (r.mx0, r.my0, r.mx0 + r.map_w,
                             r.my0 + r.map_h),
                     Streams(PHRASE).fork("labels"))
        for it in items:
            if not it.optional:
                self.assertFalse(it.hidden, f"required label hidden: {it.text}")


if __name__ == "__main__":
    unittest.main()
