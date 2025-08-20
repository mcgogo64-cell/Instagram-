# Instagram Private Audit – Web

Tarayıcıdan çalışan kapsamlı bir **whitehat test aracı**. Replit’te **Run**’a basınca açılır.  
**Amaç:** Girişsiz (anon) isteklerle, verdiğiniz **Reel/Post URL** için potansiyel sızıntıları kontrol eder.

## Özellikler
- Public page (login-wall) kontrolü
- `?__a=1` ve `?__a=1&__d=dis` JSON davranışı
- **oEmbed** (thumbnail/meta sızıntısı)
- **View-Source HTML taraması** (anahtar kelime izleri)
- **CDN medya linki** testi (opsiyonel; yalnızca kendi içeriğiniz)
- **Existence-oracle**: verdiğiniz kısa kod listesinde oEmbed yanıt farkları
- Raporu **Markdown** ve **JSON** indirme

## Kurulum (GitHub → Replit)
1. Bu depoyu GitHub’a yükleyin (aynı dosya yapısı).
2. Replit → **Create Repl → Import from GitHub**.
3. **Run**’a basın (Node/Express server açılır ve web arayüzü gelir).

## Kullanım
1. `Reel/Post URL` alanına hedefi girin (ör. `https://www.instagram.com/reel/XXXXXX/`).
2. **Tüm Testleri Çalıştır** butonuna basın.
3. (İsteğe bağlı) Kendi CDN linkinizi ve kısa kod listenizi girip **İsteğe Bağlıları Çalıştır**.
4. Sonuçlar ekranın altında listelenir; **Raporu indir** butonlarıyla dışa aktarın.

## Sınırlar ve Etik
- Bu araç **brute-force** yapmaz, ID/shortcode tahmini denemez.
- Sadece **instagram.com**, `*.cdninstagram.com`, `*.fbcdn.net` alanlarına istek atar.
- Yalnızca **kendi içeriğiniz** ve **izinli hedefler** için kullanın; Instagram ToS + Meta Whitehat kurallarına uyun.
