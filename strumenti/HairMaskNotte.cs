using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Collections.Generic;

public static class HairMaskNotte
{
    static int W, H;

    static float Smooth(float e0, float e1, float x)
    {
        float t = Math.Max(0f, Math.Min(1f, (x - e0) / (e1 - e0)));
        return t * t * (3 - 2 * t);
    }

    static bool InPoly(float x, float y, float[] p)
    {
        bool c = false; int n = p.Length / 2;
        for (int i = 0, j = n - 1; i < n; j = i++)
        {
            float xi = p[2 * i], yi = p[2 * i + 1], xj = p[2 * j], yj = p[2 * j + 1];
            if (((yi > y) != (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) c = !c;
        }
        return c;
    }

    static float[] PolyMask(params float[][] polys)
    {
        var m = new float[W * H];
        foreach (var p in polys)
        {
            float minx = 1e9f, miny = 1e9f, maxx = -1e9f, maxy = -1e9f;
            for (int i = 0; i < p.Length; i += 2) { minx = Math.Min(minx, p[i]); maxx = Math.Max(maxx, p[i]); miny = Math.Min(miny, p[i + 1]); maxy = Math.Max(maxy, p[i + 1]); }
            for (int y = Math.Max(0, (int)miny); y <= Math.Min(H - 1, (int)maxy); y++)
                for (int x = Math.Max(0, (int)minx); x <= Math.Min(W - 1, (int)maxx); x++)
                    if (InPoly(x + .5f, y + .5f, p)) m[y * W + x] = 1f;
        }
        return m;
    }

    // box blur separabile ripetuta = approssimazione gaussiana
    static float[] Blur(float[] src, int r, int passes)
    {
        var a = (float[])src.Clone(); var b = new float[W * H];
        for (int k = 0; k < passes; k++)
        {
            for (int y = 0; y < H; y++)
            {
                float acc = 0; int cnt = 0;
                for (int x = -r; x <= r; x++) if (x >= 0 && x < W) { acc += a[y * W + x]; cnt++; }
                for (int x = 0; x < W; x++)
                {
                    b[y * W + x] = acc / cnt;
                    int xo = x - r, xi = x + r + 1;
                    if (xo >= 0) { acc -= a[y * W + xo]; cnt--; }
                    if (xi < W) { acc += a[y * W + xi]; cnt++; }
                }
            }
            for (int x = 0; x < W; x++)
            {
                float acc = 0; int cnt = 0;
                for (int y = -r; y <= r; y++) if (y >= 0 && y < H) { acc += b[y * W + x]; cnt++; }
                for (int y = 0; y < H; y++)
                {
                    a[y * W + x] = acc / cnt;
                    int yo = y - r, yi = y + r + 1;
                    if (yo >= 0) { acc -= b[yo * W + x]; cnt--; }
                    if (yi < H) { acc += b[yi * W + x]; cnt++; }
                }
            }
        }
        return a;
    }

    // distanza (chamfer 3-4) dai pixel "seed"
    static float[] Distance(bool[] seed)
    {
        var d = new float[W * H];
        for (int i = 0; i < d.Length; i++) d[i] = seed[i] ? 0 : 1e6f;
        for (int y = 0; y < H; y++) for (int x = 0; x < W; x++)
        {
            int i = y * W + x; float v = d[i];
            if (x > 0) v = Math.Min(v, d[i - 1] + 1);
            if (y > 0) { v = Math.Min(v, d[i - W] + 1); if (x > 0) v = Math.Min(v, d[i - W - 1] + 1.414f); if (x < W - 1) v = Math.Min(v, d[i - W + 1] + 1.414f); }
            d[i] = v;
        }
        for (int y = H - 1; y >= 0; y--) for (int x = W - 1; x >= 0; x--)
        {
            int i = y * W + x; float v = d[i];
            if (x < W - 1) v = Math.Min(v, d[i + 1] + 1);
            if (y < H - 1) { v = Math.Min(v, d[i + W] + 1); if (x < W - 1) v = Math.Min(v, d[i + W + 1] + 1.414f); if (x > 0) v = Math.Min(v, d[i + W - 1] + 1.414f); }
            d[i] = v;
        }
        return d;
    }

    static byte[] ReadRgb(Bitmap bmp)
    {
        var data = bmp.LockBits(new Rectangle(0, 0, W, H), ImageLockMode.ReadOnly, PixelFormat.Format24bppRgb);
        var buf = new byte[data.Stride * H]; Marshal.Copy(data.Scan0, buf, 0, buf.Length);
        var rgb = new byte[W * H * 3];
        for (int y = 0; y < H; y++) for (int x = 0; x < W; x++)
        {
            int s = y * data.Stride + x * 3, t = (y * W + x) * 3;
            rgb[t] = buf[s + 2]; rgb[t + 1] = buf[s + 1]; rgb[t + 2] = buf[s]; // BGR -> RGB
        }
        bmp.UnlockBits(data); return rgb;
    }

    static void SaveRgb(byte[] rgb, int w, int h, string path)
    {
        var bmp = new Bitmap(w, h, PixelFormat.Format24bppRgb);
        var data = bmp.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.WriteOnly, PixelFormat.Format24bppRgb);
        var buf = new byte[data.Stride * h];
        for (int y = 0; y < h; y++) for (int x = 0; x < w; x++)
        {
            int s = y * data.Stride + x * 3, t = (y * w + x) * 3;
            buf[s] = rgb[t + 2]; buf[s + 1] = rgb[t + 1]; buf[s + 2] = rgb[t];
        }
        Marshal.Copy(buf, 0, data.Scan0, buf.Length); bmp.UnlockBits(data);
        bmp.Save(path, ImageFormat.Png); bmp.Dispose();
    }

    static void SaveGray(float[] m, string path)
    {
        var rgb = new byte[W * H * 3];
        for (int i = 0; i < m.Length; i++) { byte v = (byte)Math.Round(255 * Math.Max(0, Math.Min(1, m[i]))); rgb[3 * i] = rgb[3 * i + 1] = rgb[3 * i + 2] = v; }
        SaveRgb(rgb, W, H, path);
    }

    static void Zoom(byte[] a, byte[] b, byte[] c, int x0, int y0, int w, int h, string path)
    {
        int s = 2, gap = 6, ow = (w * s) * 3 + gap * 2, oh = h * s;
        var o = new byte[ow * oh * 3];
        for (int i = 0; i < o.Length; i++) o[i] = 255;
        var src = new[] { a, b, c };
        for (int k = 0; k < 3; k++)
            for (int y = 0; y < oh; y++) for (int x = 0; x < w * s; x++)
            {
                int sx = Math.Min(W - 1, x0 + x / s), sy = Math.Min(H - 1, y0 + y / s);
                int si = (sy * W + sx) * 3, di = (y * ow + k * (w * s + gap) + x) * 3;
                o[di] = src[k][si]; o[di + 1] = src[k][si + 1]; o[di + 2] = src[k][si + 2];
            }
        SaveRgb(o, ow, oh, path);
    }

    // ============ ZONE DISEGNATE A MANO (coordinate della foto 1280x720) ============
    // Spalle (pelle sotto/accanto ai capelli)
    static readonly float[] ShoulderL = { 540,720, 548,600, 570,520, 605,482, 655,462, 712,456, 708,560, 714,720 };
    static readonly float[] ShoulderR = { 1088,456, 1130,470, 1168,492, 1190,530, 1200,600, 1206,720, 1100,720, 1098,600 };
    // Forbici + mano in alto
    static readonly float[] Scissors = { 912,262, 1000,236, 1062,212, 1100,196, 1112,150, 1112,60, 1150,22, 1280,0, 1280,272, 1238,268, 1195,266, 1140,246, 1090,252, 1032,288, 980,336, 948,334, 985,282, 914,280 };
    // Mano in alto (solo pelle, nessun capello)
    static readonly float[] HandTopSkin = { 1100,0, 1280,0, 1280,270, 1180,268, 1132,254, 1100,226 };
    // Mano in basso (dita che trattengono la ciocca)
    static readonly float[] HandLow = { 1146,346, 1162,318, 1200,302, 1250,300, 1280,306, 1280,474, 1238,474, 1196,420, 1170,392, 1148,372 };
    // Ciocca tesa tra forbici e dita: deve restare ancorata
    static readonly float[] HeldStrand = { 1000,262, 1060,262, 1120,290, 1170,318, 1176,362, 1130,352, 1060,318, 1000,300 };
    // Coda libera della ciocca sotto le dita
    static readonly float[] StrandTail = { 1150,360, 1210,380, 1268,470, 1280,520, 1280,640, 1200,640, 1160,520, 1140,420 };

    // VERSIONE NOTTE: capelli biondi su sfondo nero. Stessa posa della foto di giorno: le zone disegnate
    // a mano (in coordinate 1280x720) vengono scalate alla risoluzione della foto (S = larghezza / 1280).
    static float S = 1f;
    static float[] Sc(float[] p) { var o = new float[p.Length]; for (int i = 0; i < p.Length; i++) o[i] = p[i] * S; return o; }
    static int Rd(float v) { return Math.Max(1, (int)Math.Round(v * S)); }

    public static string Run(string photo, string outDir)
    {
        var bmp = new Bitmap(photo); W = bmp.Width; H = bmp.Height;
        var rgb = ReadRgb(bmp); bmp.Dispose();
        S = W / 1280f;
        int N = W * H;
        var lum = new float[N];
        for (int i = 0; i < N; i++) lum[i] = .299f * rgb[3 * i] + .587f * rgb[3 * i + 1] + .114f * rgb[3 * i + 2];
        var shL = Sc(ShoulderL); var shR = Sc(ShoulderR); var scP = Sc(Scissors); var htP = Sc(HandTopSkin);
        var hlP = Sc(HandLow); var hsP = Sc(HeldStrand); var stP = Sc(StrandTail);

        // ---------- 1) MASCHERA AUTOMATICA (solo colore: "tutto ciò che non è sfondo nero") ----------
        var auto = new float[N];
        for (int i = 0; i < N; i++) auto[i] = Smooth(10, 40, lum[i]);
        SaveGray(auto, outDir + "\\1_mask_auto.png");

        // ---------- 2) MASCHERA CORRETTA ----------
        // bordo esterno della spalla destra (coordinate della foto notturna 2000x1124): i pixel di contorno
        // pelle/nero non vanno scambiati per capelli; la coda della ciocca, bionda, resta comunque riconosciuta
        float[] shREdge = { 1840 * S / 1.5625f, 735 * S / 1.5625f, 1912 * S / 1.5625f, 760 * S / 1.5625f, 1922 * S / 1.5625f, 1124 * S / 1.5625f, 1845 * S / 1.5625f, 1124 * S / 1.5625f };
        var shoulders = PolyMask(shL, shR);
        var edgeZone = PolyMask(shREdge);     // qui vale solo la regola del colore (niente regola di vicinanza)
        var scissors = PolyMask(scP);
        var handLow = PolyMask(hlP);
        var hair = new float[N];
        for (int i = 0; i < N; i++)
        {
            int x = i % W, y = i / W;
            float r = rgb[3 * i], g = rgb[3 * i + 1], b = rgb[3 * i + 2];
            float gr = g / Math.Max(1f, r), sat = (r - b) / Math.Max(1f, r);
            float notBg = Smooth(10, 40, lum[i]);
            // tonalità "bionda": verde/rosso alto (capelli 0,72–0,92; pelle 0,56–0,67)
            float blond = Smooth(0.69f, 0.75f, gr);
            float h;
            if (shoulders[i] > 0 || edgeZone[i] > 0) h = notBg * blond;   // sopra/accanto alla pelle: solo tonalità bionda
            else h = notBg;                                           // altrove: tutto ciò che non è nero è capello
            if (scissors[i] > 0 || handLow[i] > 0)
                // zone mani/forbici: solo biondo e saturo (il metallo è grigio, sat < 0,25; le dita sono rosate)
                h = notBg * blond * Smooth(0.24f, 0.34f, sat);
            if (InPoly(x + .5f, y + .5f, htP)) h = 0;                 // mano in alto: nessun capello
            if (handLow[i] > 0 && (x >= 1200 * S || y >= 430 * S)) h = 0;  // la ciocca passa solo tra pollice e indice
            hair[i] = h;
        }
        // sulle spalle vale come "capelli" solo ciò che è attaccato alla massa principale
        var mainSeed = new bool[N];
        for (int i = 0; i < N; i++) mainSeed[i] = shoulders[i] == 0 && scissors[i] == 0 && handLow[i] == 0 && hair[i] > .6f;
        var dMain = Distance(mainSeed);
        // (qui più stretto che di giorno: la pelle illuminata accanto ai capelli ha una tonalità vicina al biondo)
        for (int i = 0; i < N; i++) if (shoulders[i] > 0) hair[i] *= 1 - Smooth(6 * S, 16 * S, dMain[i]);
        // chiude i piccoli buchi (ombre scure tra le onde) senza allargare i bordi
        var around = Blur(hair, Rd(3), 2);
        for (int i = 0; i < N; i++) if (scissors[i] == 0 && handLow[i] == 0) hair[i] = Math.Max(hair[i], Smooth(.55f, .85f, around[i]));
        hair = Blur(hair, Rd(1), 1);
        SaveGray(hair, outDir + "\\2_mask_hair.png");

        // ---------- 3) MAPPA DI MOVIMENTO (quanto può muoversi ogni pixel) ----------
        // pelle = zona spalle/mano non coperta da capelli (e non sfondo nero)
        var skinSeed = new bool[N];
        for (int i = 0; i < N; i++) skinSeed[i] = ((shoulders[i] > 0 || edgeZone[i] > 0) && hair[i] < .35f && lum[i] > 14) || (handLow[i] > 0 && hair[i] < .3f && lum[i] > 14);
        var dSkin = Distance(skinSeed);

        var lockRaw = PolyMask(scP, hlP, hsP);
        var lockSoft = Blur(lockRaw, Rd(7), 2);
        var tail = PolyMask(stP);
        var tailSoft = Blur(tail, Rd(6), 2);

        var mob = new float[N];
        for (int i = 0; i < N; i++)
        {
            int x = i % W, y = i / W;
            float x0 = x / S, y0 = y / S;                     // coordinate "giorno" (1280x720)
            float ex = (x0 - 890) / 125f, ey = (y0 - 165) / 150f;
            float e = (float)Math.Sqrt(ex * ex + ey * ey);
            float root = Smooth(1.0f, 2.7f, e);               // radici ferme
            float lat = 0.55f + 0.45f * Smooth(40, 200, Math.Abs(x0 - 900));   // lati più mobili
            float nearSkin = 0.10f + 0.90f * Smooth(4 * S, 75 * S, dSkin[i]); // vicino alla pelle: poco
            float m = hair[i] * root * lat * nearSkin;
            float tailW = 0.45f * Smooth(395, 610, y0);       // coda della ciocca: poco, lontano dalle dita
            m = m * (1 - tailSoft[i]) + hair[i] * tailW * tailSoft[i];
            m *= 1 - Math.Min(1, lockSoft[i] * 1.6f);         // forbici, mani, ciocca tesa: bloccate
            mob[i] = m;
        }
        // alone verso lo sfondo NERO: permette ai capelli di "uscire" oltre il bordo
        var halo = Blur(mob, Rd(10), 3);
        var lockWide = Blur(lockRaw, Rd(14), 2);
        for (int i = 0; i < N; i++)
        {
            bool bg = lum[i] < 14 && shoulders[i] == 0;
            if (bg) mob[i] = Math.Max(mob[i], Math.Min(1, halo[i] * 1.6f) * (1 - Math.Min(1, lockWide[i] * 2f)));
        }
        mob = Blur(mob, Rd(2), 2);
        SaveGray(mob, outDir + "\\3_mobility.png");

        // ---------- 4) IMMAGINI DI CONTROLLO ----------
        var ov = new byte[N * 3];
        var ovHair = new byte[N * 3];
        for (int i = 0; i < N; i++)
        {
            float r = rgb[3 * i], g = rgb[3 * i + 1], b = rgb[3 * i + 2];
            // overlay movimento: rosso = si muove molto, blu = bloccato
            float m = mob[i], l = lockRaw[i];
            float gr = lum[i] * .55f + 100;
            ov[3 * i] = (byte)Math.Min(255, gr * (1 - m * .7f) + 255 * m * .7f);
            ov[3 * i + 1] = (byte)Math.Min(255, gr * (1 - m * .7f) * (1 - l * .35f) + 40 * m * .7f);
            ov[3 * i + 2] = (byte)Math.Min(255, gr * (1 - m * .7f) * (1 - l * .5f) + 40 * m * .7f + 255 * l * .5f);
            // overlay capelli: verde dove la maschera dice "capelli"
            float hh = hair[i];
            ovHair[3 * i] = (byte)(r * (1 - hh * .6f));
            ovHair[3 * i + 1] = (byte)Math.Min(255, g * (1 - hh * .6f) + 255 * hh * .6f);
            ovHair[3 * i + 2] = (byte)(b * (1 - hh * .6f));
        }
        SaveRgb(ov, W, H, outDir + "\\4_check_mobility.png");
        SaveRgb(ovHair, W, H, outDir + "\\4_check_hair.png");
        // ritagli ingranditi 2x delle zone delicate: originale | maschera capelli | movimento
        Zoom(rgb, ovHair, ov, (int)(560 * S), (int)(430 * S), (int)(220 * S), (int)(290 * S), outDir + "\\5_zoom_spalla_sx.png");
        Zoom(rgb, ovHair, ov, (int)(1040 * S), (int)(430 * S), (int)(240 * S), (int)(290 * S), outDir + "\\5_zoom_spalla_dx.png");
        Zoom(rgb, ovHair, ov, (int)(900 * S), (int)(180 * S), (int)(380 * S), (int)(300 * S), outDir + "\\5_zoom_mani_forbici.png");
        return "ok " + W + "x" + H;
    }
}
