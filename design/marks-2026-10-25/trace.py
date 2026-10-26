"""Trace the ink out of a scan (python3 trace.py out.json scan.jpg) into a 100x100 SVG path, keeping its real edge. design/icon.svg is stamp-scan.jpg through this."""
import sys, json, warnings, numpy as np
from PIL import Image
from skimage import filters, measure, morphology
warnings.filterwarnings('ignore')

def mask(path):
    a = np.asarray(Image.open(path).convert('RGB')).astype(float)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    ink = (b - r) > 60
    ink = morphology.remove_small_objects(ink, max_size=400)
    return morphology.remove_small_holes(ink, max_size=600)

def trace(path, smooth=1.1, tol=0.7):
    m = mask(path)
    ys, xs = np.nonzero(m)
    h, w = ys.max() - ys.min(), xs.max() - xs.min()
    s = 100 / max(h, w)
    x0 = xs.min() - (max(h, w) - w) / 2; y0 = ys.min() - (max(h, w) - h) / 2
    soft = filters.gaussian(m.astype(float), smooth)
    out = []
    for c in measure.find_contours(np.pad(soft, 2), 0.5):
        c = measure.approximate_polygon(c - 2, tol)
        if len(c) < 4: continue
        out.append('M' + ' '.join(f'{(x - x0) * s:.2f},{(y - y0) * s:.2f}' for y, x in c) + 'Z')
    return ' '.join(out)

if __name__ == '__main__':
    res = {p.split('/')[-1][:-4]: trace(p) for p in sys.argv[2:]}
    json.dump(res, open(sys.argv[1], 'w'))
    print({k: len(v) for k, v in res.items()})
