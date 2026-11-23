# AMO listed form — hazır alanlar

Aşağıdaki değerleri Eklenti Geliştirici Merkezi formuna kopyalayabilirsin.
Sürüm: 0.10.3 (AMO zip'i: `privacy-shield-firefox-0.10.3-amo.zip`).

## İsim

```
Privacy Shield
```

## Eklenti URL'si (slug)

```
privacy-shield
```

Doluysa: `privacy-shield-adblock`.

## Özet (250 karakter sınırı, ~130 karakter)

```
Gizlilik odaklı reklam ve izleyici engelleyici; yerel filtreleme, site kontrolleri, dinamik kurallar ve veri toplamayan tasarım.
```

## Açıklama (250+ karakter, Markdown destekli)

```
Privacy Shield, reklamları ve izleyicileri engelleyen, gizliliği önceleyen bir Firefox eklentisidir. Tüm filtreleme tarayıcınızda yapılır; hiçbir kullanıcı verisi harici sunucuya gönderilmez ve telemetri yoktur.

Öne çıkan özellikler:
- EasyList, EasyPrivacy, AdGuard dil listeleri ve Peter Lowe's Blocklist desteği
- Ağ ve kozmetik engelleme, `@@` istisnaları ve kullanıcı whitelist'i
- `$removeparam` (regex dahil), `$csp` ve `$removeheader` kuralları
- Site bazlı Allow / Block / Noop dinamik filtreleme kuralları
- Üçüncü taraf çerez ve script kontrolü, WebRTC relay modu, `$document` strict blocking
- Anti-adblock uyarılarını kaldıran yerel scriptlet'ler ve prosedürel metin kuralları
- Element picker (sağ tık + popup), istek logu, ayar yedeği (JSON içe/dışa aktarma)
- Karanlık, sekmeli ve sade ayarlar sayfası

İzinler: `webRequest` / `webRequestBlocking` istekleri engellemek ve başlıkları değiştirmek, `storage` ayarları yerel tutmak, `tabs` aktif sekmeyi okumak, `privacy` WebRTC politikasını ayarlamak, `menus` sağ tık menüsü, `<all_urls>` ise tüm sitelerde çalışmak için gereklidir.

Filtre listeleri herkese açık kaynaklardan indirilir; bunlar yalnızca veridir ve eklenti uzaktan kod çalıştırmaz. Kaynak kod ve lisans: https://github.com/akamusti/privacy-shield-firefox (GPL-3.0).
```

## Onay kutuları

- `Bu eklenti deneyseldir` → **işaretleme**
- `Bu eklenti için ödeme yapılması, ücretli bir servis/yazılım veya ek donanım gerekiyor.` → **işaretleme**
- `Bu eklentinin gizlilik politikası var mı?` → **işaretleme** (veri toplanmadığı için gerek yok)

## Kategoriler (en fazla 3)

- [x] **Güvenlik ve Gizlilik**
- [x] **Araçlar**

Diğer kutuları boş bırak.

## Destek e-postası

```
akamusti@users.noreply.github.com
```

Not: Bu GitHub noreply adresidir. Gerçek bir destek adresin varsa onu yaz.

## Destek sitesi

```
https://github.com/akamusti/privacy-shield-firefox/issues
```

## Lisans

Şu seçeneği işaretle:

```
Yalnızca GNU Genel Kamu Lisansı v3.0
```

(GPL-3.0-only)

## İncelemeye notlar

```
Merhaba. Eklentiyi incelemek için ek bir hesap, abonelik veya donanım gerekmez.

Önerilen test adımları:
1) Eklentiyi kurun; herhangi bir haber sitesinde reklam/izleyici isteklerinin engellendiğini ve sayfanın normal açıldığını kontrol edin.
2) Popup'taki güç düğmesi, Cookies / Scripts / Hide ads anahtarları ve Dynamic filtering (A / B / N) hücrelerini deneyin.
3) Ayarlar > My Filters alanına `||example.com^` ekleyip kaydedin; example.com isteklerinin engellendiğini görün.
4) Ayarlar > Backup ile dışa/içe aktarmanın yerel olarak çalıştığını doğrulayın.
5) Bir anti-adblock uyarısı gösteren sitede (ör. Letterboxd) uyarının kalktığını ve sayfanın tıklanabilir kaldığını kontrol edin.

Filtre listeleri herkese açık URL'lerden indirilir; bunlar yalnızca veridir, uzaktan kod çalıştırılmaz. Kullanıcı verisi toplanmaz veya gönderilmez. İzin gerekçeleri AMO_SUBMISSION.md dosyasındadır.

Kaynak kod: https://github.com/akamusti/privacy-shield-firefox
```

Bu not yalnızca sana ve inceleyicilere görünür.
