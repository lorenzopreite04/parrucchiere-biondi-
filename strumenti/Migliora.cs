// Migliora una foto piccola per il sito: ingrandimento di alta qualità + nitidezza (maschera di contrasto)
// + un tocco di contrasto. Non inventa dettagli (non è un'IA): rende la foto più pulita e nitida quando
// il sito la mostra più grande dell'originale. Per la qualità vera servono le foto originali.
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class Migliora {
  public static string Run(string ingresso, string uscita, double scala, double nitidezza, double raggio, double contrasto) {
    var src = new Bitmap(ingresso);
    int W = (int)Math.Round(src.Width * scala), H = (int)Math.Round(src.Height * scala);
    var big = new Bitmap(W, H, PixelFormat.Format24bppRgb);
    using (var g = Graphics.FromImage(big)) {
      g.InterpolationMode = InterpolationMode.HighQualityBicubic;
      g.PixelOffsetMode = PixelOffsetMode.HighQuality;
      g.SmoothingMode = SmoothingMode.HighQuality;
      using (var ia = new ImageAttributes()) {
        ia.SetWrapMode(WrapMode.TileFlipXY);                     // niente bordi scuri ai margini
        g.DrawImage(src, new Rectangle(0, 0, W, H), 0, 0, src.Width, src.Height, GraphicsUnit.Pixel, ia);
      }
    }
    src.Dispose();

    var d = big.LockBits(new Rectangle(0, 0, W, H), ImageLockMode.ReadWrite, PixelFormat.Format24bppRgb);
    int stride = d.Stride; var px = new byte[stride * H];
    Marshal.Copy(d.Scan0, px, 0, px.Length);
    // maschera di contrasto: originale + (originale - sfocata) * nitidezza
    var f = new float[W * H * 3];
    for (int y = 0; y < H; y++) for (int x = 0; x < W; x++) for (int c = 0; c < 3; c++) f[(y * W + x) * 3 + c] = px[y * stride + x * 3 + c];
    var b = f;
    int r = Math.Max(1, (int)Math.Round(raggio));
    for (int k = 0; k < 3; k++) b = Box(b, W, H, r);
    // contrasto morbido attorno al grigio medio
    for (int n = 0; n < W * H * 3; n++) {
      double v = f[n] + (f[n] - b[n]) * nitidezza;
      v = 128 + (v - 128) * contrasto;
      int y = (n / 3) / W, x = (n / 3) % W, c = n % 3;
      px[y * stride + x * 3 + c] = (byte)Math.Max(0, Math.Min(255, Math.Round(v)));
    }
    Marshal.Copy(px, 0, d.Scan0, px.Length);
    big.UnlockBits(d);

    var jpg = Array.Find(ImageCodecInfo.GetImageEncoders(), e => e.MimeType == "image/jpeg");
    var p = new EncoderParameters(1); p.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, 90L);
    big.Save(uscita, jpg, p); big.Dispose();
    return W + "x" + H;
  }
  static float[] Box(float[] v, int W, int H, int r) {
    var t = new float[v.Length]; var o = new float[v.Length];
    for (int y = 0; y < H; y++) for (int c = 0; c < 3; c++) {
      float s = 0; for (int k = -r; k <= r; k++) s += v[(y * W + Math.Min(W - 1, Math.Max(0, k))) * 3 + c];
      for (int x = 0; x < W; x++) {
        t[(y * W + x) * 3 + c] = s / (2 * r + 1);
        s += v[(y * W + Math.Min(W - 1, x + r + 1)) * 3 + c] - v[(y * W + Math.Max(0, x - r)) * 3 + c];
      }
    }
    for (int x = 0; x < W; x++) for (int c = 0; c < 3; c++) {
      float s = 0; for (int k = -r; k <= r; k++) s += t[(Math.Min(H - 1, Math.Max(0, k)) * W + x) * 3 + c];
      for (int y = 0; y < H; y++) {
        o[(y * W + x) * 3 + c] = s / (2 * r + 1);
        s += t[(Math.Min(H - 1, y + r + 1) * W + x) * 3 + c] - t[(Math.Max(0, y - r) * W + x) * 3 + c];
      }
    }
    return o;
  }
}
