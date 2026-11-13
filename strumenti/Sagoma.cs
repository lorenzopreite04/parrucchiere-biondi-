// Sagoma della ragazza (capelli, pelle, mani, forbici) per i riflessi di luce: bianco = ragazza, nero = sfondo.
// I riflessi si disegnano solo sul nero, così sembrano DIETRO la ragazza.
// Funziona su foto con sfondo uniforme (bianco di giorno, nero di notte).
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class Sagoma {
  // foto: PNG della foto · uscita: PNG in scala di grigi 640x360
  // soglia: differenza minima dal colore di fondo per dire "è ragazza" · allarga: margine (px a 640) per i capelli che si muovono
  public static string Run(string foto, string uscita, int soglia, int allarga, int sfuma) {
    const int W = 640, H = 360;
    var src = new Bitmap(foto);
    var small = new Bitmap(W, H, PixelFormat.Format24bppRgb);
    using (var g = Graphics.FromImage(small)) { g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic; g.DrawImage(src, 0, 0, W, H); }
    src.Dispose();
    var px = Read(small); small.Dispose();

    // colore di fondo: mediana dei bordi sinistro e superiore (lì c'è solo sfondo)
    var rs = new List<int>(); var gs = new List<int>(); var bs = new List<int>();
    for (int x = 0; x < W / 3; x++) { int i = (2 * W + x) * 3; bs.Add(px[i]); gs.Add(px[i + 1]); rs.Add(px[i + 2]); }
    for (int y = 0; y < H; y++) { int i = (y * W + 2) * 3; bs.Add(px[i]); gs.Add(px[i + 1]); rs.Add(px[i + 2]); }
    rs.Sort(); gs.Sort(); bs.Sort();
    int br = rs[rs.Count / 2], bg = gs[gs.Count / 2], bb = bs[bs.Count / 2];

    // 1) ragazza = pixel lontani dal colore di fondo
    var fg = new bool[W * H];
    for (int n = 0; n < W * H; n++) {
      int d = Math.Max(Math.Abs(px[n * 3 + 2] - br), Math.Max(Math.Abs(px[n * 3 + 1] - bg), Math.Abs(px[n * 3] - bb)));
      fg[n] = d > soglia;
    }
    // la foto può avere una cornice sottile non proprio del colore di fondo: i 4 px di bordo copiano i pixel appena dentro
    const int E = 4;
    for (int y = 0; y < H; y++) for (int x = 0; x < W; x++) {
      if (x >= E && y >= E && x < W - E && y < H - E) continue;
      int ix = Math.Min(W - 1 - E, Math.Max(E, x)), iy = Math.Min(H - 1 - E, Math.Max(E, y));
      fg[y * W + x] = fg[iy * W + ix];
    }
    // 2) chiusura (riempie i piccoli buchi tra le ciocche)
    fg = Erode(Dilate(fg, W, H, 3), W, H, 3);
    // 3) lo sfondo è solo quello collegato ai bordi della foto: i "buchi" chiusi dentro la ragazza diventano ragazza
    var bgReach = new bool[W * H]; var q = new Queue<int>();
    Action<int> push = (n) => { if (!fg[n] && !bgReach[n]) { bgReach[n] = true; q.Enqueue(n); } };
    for (int x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
    for (int y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
    while (q.Count > 0) {
      int n = q.Dequeue(), x = n % W, y = n / W;
      if (x > 0) push(n - 1); if (x < W - 1) push(n + 1); if (y > 0) push(n - W); if (y < H - 1) push(n + W);
    }
    var girl = new bool[W * H]; int count = 0;
    for (int n = 0; n < W * H; n++) { girl[n] = !bgReach[n]; if (girl[n]) count++; }
    // 4) margine per i capelli che si muovono, poi bordo sfumato
    girl = Dilate(girl, W, H, allarga);
    var v = new float[W * H];
    for (int n = 0; n < W * H; n++) v[n] = girl[n] ? 1f : 0f;
    for (int k = 0; k < 3; k++) v = BoxBlur(v, W, H, sfuma);

    var outB = new Bitmap(W, H, PixelFormat.Format24bppRgb);
    var o = new byte[W * H * 3];
    for (int n = 0; n < W * H; n++) { byte b = (byte)Math.Round(Math.Min(1f, v[n]) * 255); o[n * 3] = o[n * 3 + 1] = o[n * 3 + 2] = b; }
    Write(outB, o); outB.Save(uscita, ImageFormat.Png); outB.Dispose();
    return string.Format("fondo rgb({0},{1},{2}) · ragazza {3:0.0}% della foto", br, bg, bb, 100.0 * count / (W * H));
  }

  static byte[] Read(Bitmap b) {
    var d = b.LockBits(new Rectangle(0, 0, b.Width, b.Height), ImageLockMode.ReadOnly, PixelFormat.Format24bppRgb);
    var a = new byte[b.Width * b.Height * 3];
    for (int y = 0; y < b.Height; y++) Marshal.Copy(d.Scan0 + y * d.Stride, a, y * b.Width * 3, b.Width * 3);
    b.UnlockBits(d); return a;
  }
  static void Write(Bitmap b, byte[] a) {
    var d = b.LockBits(new Rectangle(0, 0, b.Width, b.Height), ImageLockMode.WriteOnly, PixelFormat.Format24bppRgb);
    for (int y = 0; y < b.Height; y++) Marshal.Copy(a, y * b.Width * 3, d.Scan0 + y * d.Stride, b.Width * 3);
    b.UnlockBits(d);
  }
  static bool[] Dilate(bool[] m, int W, int H, int r) {
    var o = new bool[W * H];
    for (int y = 0; y < H; y++) for (int x = 0; x < W; x++) {
      bool on = false;
      for (int dy = -r; dy <= r && !on; dy++) { int yy = y + dy; if (yy < 0 || yy >= H) continue;
        for (int dx = -r; dx <= r; dx++) { int xx = x + dx; if (xx < 0 || xx >= W || dx * dx + dy * dy > r * r) continue; if (m[yy * W + xx]) { on = true; break; } } }
      o[y * W + x] = on;
    }
    return o;
  }
  static bool[] Erode(bool[] m, int W, int H, int r) {
    var inv = new bool[W * H]; for (int n = 0; n < W * H; n++) inv[n] = !m[n];
    var d = Dilate(inv, W, H, r); for (int n = 0; n < W * H; n++) d[n] = !d[n]; return d;
  }
  static float[] BoxBlur(float[] v, int W, int H, int r) {
    var t = new float[W * H]; var o = new float[W * H];
    for (int y = 0; y < H; y++) for (int x = 0; x < W; x++) { float s = 0; int c = 0; for (int k = -r; k <= r; k++) { int xx = Math.Min(W - 1, Math.Max(0, x + k)); s += v[y * W + xx]; c++; } t[y * W + x] = s / c; }
    for (int y = 0; y < H; y++) for (int x = 0; x < W; x++) { float s = 0; int c = 0; for (int k = -r; k <= r; k++) { int yy = Math.Min(H - 1, Math.Max(0, y + k)); s += t[yy * W + x]; c++; } o[y * W + x] = s / c; }
    return o;
  }
}
