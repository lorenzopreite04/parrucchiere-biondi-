using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class Balayage
{
    static int W, H;
    static float Smooth(float e0, float e1, float x) { float t = Math.Max(0f, Math.Min(1f, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); }
    static float Lerp(float a, float b, float t) { return a + (b - a) * t; }

    static byte[] Read(string path, out int w, out int h)
    {
        var bmp = new Bitmap(path); w = bmp.Width; h = bmp.Height;
        var d = bmp.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.ReadOnly, PixelFormat.Format24bppRgb);
        var buf = new byte[d.Stride * h]; Marshal.Copy(d.Scan0, buf, 0, buf.Length);
        var rgb = new byte[w * h * 3];
        for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) { int s = y * d.Stride + x * 3, t = (y * w + x) * 3; rgb[t] = buf[s + 2]; rgb[t + 1] = buf[s + 1]; rgb[t + 2] = buf[s]; }
        bmp.UnlockBits(d); bmp.Dispose(); return rgb;
    }

    static Bitmap ToBitmap(byte[] rgb, int w, int h)
    {
        var bmp = new Bitmap(w, h, PixelFormat.Format24bppRgb);
        var d = bmp.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.WriteOnly, PixelFormat.Format24bppRgb);
        var buf = new byte[d.Stride * h];
        for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) { int s = y * d.Stride + x * 3, t = (y * w + x) * 3; buf[s] = rgb[t + 2]; buf[s + 1] = rgb[t + 1]; buf[s + 2] = rgb[t]; }
        Marshal.Copy(buf, 0, d.Scan0, buf.Length); bmp.UnlockBits(d); return bmp;
    }

    static void SaveJpeg(Bitmap bmp, string path, long q)
    {
        ImageCodecInfo enc = null;
        foreach (var c in ImageCodecInfo.GetImageEncoders()) if (c.MimeType == "image/jpeg") enc = c;
        var p = new EncoderParameters(1); p.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, q);
        bmp.Save(path, enc, p);
    }

    static float[] BoxBlur(float[] a, int r)
    {
        var b = new float[W * H]; var c = new float[W * H];
        for (int y = 0; y < H; y++) { float acc = 0; int n = 0; for (int x = -r; x <= r; x++) if (x >= 0 && x < W) { acc += a[y * W + x]; n++; }
            for (int x = 0; x < W; x++) { b[y * W + x] = acc / n; int xo = x - r, xi = x + r + 1; if (xo >= 0) { acc -= a[y * W + xo]; n--; } if (xi < W) { acc += a[y * W + xi]; n++; } } }
        for (int x = 0; x < W; x++) { float acc = 0; int n = 0; for (int y = -r; y <= r; y++) if (y >= 0 && y < H) { acc += b[y * W + x]; n++; }
            for (int y = 0; y < H; y++) { c[y * W + x] = acc / n; int yo = y - r, yi = y + r + 1; if (yo >= 0) { acc -= b[yo * W + x]; n--; } if (yi < H) { acc += b[yi * W + x]; n++; } } }
        return c;
    }

    public static string Run(string photo, string hairMask, string mobility, string outDir)
    {
        int w, h; var rgb = Read(photo, out w, out h); W = w; H = h;
        int mw, mh; var mask = Read(hairMask, out mw, out mh);
        int N = W * H;
        var L = new float[N]; var M = new float[N];
        for (int i = 0; i < N; i++) { L[i] = .299f * rgb[3 * i] + .587f * rgb[3 * i + 1] + .114f * rgb[3 * i + 2]; M[i] = mask[3 * i] / 255f; }
        var Lb = BoxBlur(L, 5);

        var o = new byte[N * 3];
        for (int i = 0; i < N; i++)
        {
            int x = i % W, y = i / W;
            float r = rgb[3 * i], g = rgb[3 * i + 1], b = rgb[3 * i + 2];
            // tono "schiarito": schiarisce le ombre ma conserva il dettaglio delle ciocche
            float t = (float)Math.Pow(Math.Max(0, L[i]) / 255f, 0.55);
            float detail = (L[i] + 10) / (Lb[i] + 10);
            float k = Math.Min(1.25f, Math.Max(0.6f, detail));
            // rampa miele -> oro -> biondo chiaro
            float nr, ng, nb;
            if (t < .5f) { float u = t / .5f; nr = Lerp(92, 178, u); ng = Lerp(60, 132, u); nb = Lerp(32, 78, u); }
            else { float u = (t - .5f) / .5f; nr = Lerp(178, 246, u); ng = Lerp(132, 220, u); nb = Lerp(78, 168, u); }
            nr *= k; ng *= k; nb *= k;
            // balayage: radici naturali, schiaritura che cresce verso le lunghezze + ciocche più chiare sui lati
            float amt = Smooth(150, 470, y) * (0.82f + 0.18f * Smooth(60, 200, Math.Abs(x - 900)));
            float blend = M[i] * amt * 0.95f;
            o[3 * i] = (byte)Math.Min(255, Lerp(r, nr, blend));
            o[3 * i + 1] = (byte)Math.Min(255, Lerp(g, ng, blend));
            o[3 * i + 2] = (byte)Math.Min(255, Lerp(b, nb, blend));
        }
        var hidden = ToBitmap(o, W, H);
        SaveJpeg(hidden, outDir + "\\hero-capelli-balayage.jpg", 84);
        hidden.Dispose();

        // mappa di movimento a metà risoluzione (è morbida: 640x360 basta) in JPEG grigio
        var mob = new Bitmap(mobility);
        var small = new Bitmap(640, 360, PixelFormat.Format24bppRgb);
        using (var gr = Graphics.FromImage(small)) { gr.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic; gr.DrawImage(mob, 0, 0, 640, 360); }
        SaveJpeg(small, outDir + "\\hero-capelli-mappa.jpg", 92);
        small.Dispose(); mob.Dispose();
        return "ok";
    }
}
