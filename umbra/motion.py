"""How the sculpture moves when nobody is touching it.

A quarter turn, a pause, a quarter turn back.  It never goes the whole way
round on its own: half a rotation would show you the front word again, only
backwards, and backwards is a worse joke than it sounds.

The turn eases the way a hand does.  It loads up -- rocking a couple of degrees
the wrong way first -- swings through, overshoots a little, and settles.  The
pauses at either end are long enough to read and no longer.
"""

HOLD = 1.45          # seconds resting at a readable face
TURN = 2.30          # seconds for a quarter turn
CYCLE = 2 * (HOLD + TURN)

_BACK = 0.75
_BACK2 = _BACK * 1.525


def _ease(u):
    """In and out, with a wind-up at the start and an overshoot at the end."""
    if u <= 0.0:
        return 0.0
    if u >= 1.0:
        return 1.0
    if u < 0.5:
        t = 2 * u
        return t * t * ((_BACK2 + 1) * t - _BACK2) / 2.0
    t = 2 * u - 2
    return (t * t * ((_BACK2 + 1) * t + _BACK2) + 2) / 2.0


def azimuth_at(t):
    """Degrees of turn at time t, looping forever."""
    p = t % CYCLE
    if p < HOLD:
        return 0.0
    p -= HOLD
    if p < TURN:
        return 90.0 * _ease(p / TURN)
    p -= TURN
    if p < HOLD:
        return 90.0
    return 90.0 * (1.0 - _ease((p - HOLD) / TURN))


def legibility(degrees, window=8.5):
    """How readable each word is at this angle: (front, side), each 0..1."""
    a = degrees % 360.0
    front = max(0.0, 1.0 - min(a, 360.0 - a) / window)
    side = max(0.0, 1.0 - abs(a - 90.0) / window)
    return front ** 0.6, side ** 0.6
