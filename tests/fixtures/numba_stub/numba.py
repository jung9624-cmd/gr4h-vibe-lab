"""Stub for the `numba` package so reference/GR4H_model.py can be imported
and run without a real numba install. @nb.jit(nopython=True) is replaced
with a no-op decorator: it changes nothing about the arithmetic, only
whether it's JIT-compiled, so results are bit-for-bit identical to a real
numba run (modulo the usual float ordering non-issues here)."""


def jit(*args, **kwargs):
    if len(args) == 1 and callable(args[0]) and not kwargs:
        return args[0]

    def decorator(func):
        return func

    return decorator
