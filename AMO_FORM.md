# AMO listed form — hazır alanlar

Aşağıdaki değerleri Eklenti Geliştirici Merkezi formuna kopyalayabilirsin.
Sürüm: 0.11.1 (AMO zip'i: `shieldly-0.11.1-amo.zip`).

## İsim

```
Shieldly
```

## Eklenti URL'si (slug)

```
shieldly
```

Doluysa: `shieldly-adblock`.

## Özet (250 karakter sınırı, ~130 karakter)

```
Gizlilik odaklı reklam ve izleyici engelleyici; yerel filtreleme, site kontrolleri, dinamik kurallar ve veri toplamayan tasarım.
```

## Açıklama (250+ karakter, Markdown destekli)

```
Shieldly, reklamları ve izleyicileri engelleyen, gizliliği önceleyen bir Firefox eklentisidir. Tüm filtreleme tarayıcınızda yapılır; hiçbir kullanıcı verisi harici sunucuya gönderilmez ve telemetri yoktur.

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

Filtre listeleri herkese açık kaynaklardan indirilir; bunlar yalnızca veridir ve eklenti uzaktan kod çalıştırmaz. Kaynak kod ve lisans: https://github.com/akamusti/Shieldly-Firefox (GPL-3.0).
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
https://github.com/akamusti/Shieldly-Firefox/issues
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

Kaynak kod: https://github.com/akamusti/Shieldly-Firefox
```

Bu not yalnızca sana ve inceleyicilere görünür.

---

# AMO listing form — English fields

## Name

```
Shieldly
```

## Add-on URL (slug)

```
shieldly
```

Fallback: `shieldly-adblock`.

## Summary (250 character limit, ~110 characters)

```
Privacy-focused ad and tracker blocker with local filtering, site controls, dynamic rules and no data collection.
```

## Description (250+ characters, Markdown supported)

```
Shieldly is a privacy-first Firefox extension that blocks ads and trackers. All filtering happens locally in your browser; no user data is sent to any server and there is no telemetry.

Highlights:
- EasyList, EasyPrivacy, AdGuard language filters and Peter Lowe's Blocklist
- Network and cosmetic filtering, `@@` exceptions and a user whitelist
- `$removeparam` (including regex), `$csp` and `$removeheader` support
- Per-site Allow / Block / Noop dynamic filtering rules
- Third-party cookie and script controls, WebRTC relay mode, `$document` strict blocking
- Local scriptlets and procedural text rules that remove anti-adblock notices
- Element picker (context menu + popup), request log, settings backup (JSON)
- Dark, tabbed and compact settings page

Permissions: `webRequest` / `webRequestBlocking` block requests and modify headers, `storage` keeps settings locally, `tabs` reads the active tab, `privacy` sets the WebRTC policy, `menus` adds the context-menu entry, and `<all_urls>` is required to work on every site.

Filter lists are downloaded from public sources as data only; the extension never executes remote code. Source and license: https://github.com/akamusti/Shieldly-Firefox (GPL-3.0).
```

## Checkboxes

- `This add-on is experimental` → leave unchecked
- `This add-on requires payment, a paid service/software, or additional hardware` → leave unchecked
- `Does this add-on have a custom privacy policy?` → leave unchecked (no data is collected)

## Categories (max 3)

- [x] **Security & Privacy**
- [x] **Tools**

Leave all other categories unchecked.

## Support email

```
akamusti@users.noreply.github.com
```

Note: this is a GitHub noreply address. Replace it with your real support address if you have one.

## Support website

```
https://github.com/akamusti/Shieldly-Firefox/issues
```

## License

Select:

```
GNU General Public License v3.0 only
```

(GPL-3.0-only)

## Notes for reviewers

```
Hello. No account, subscription or extra hardware is needed to review this add-on.

Suggested test steps:
1) Install the add-on and verify that ad/tracker requests are blocked on a news site while the page loads normally.
2) Try the popup power button, the Cookies / Scripts / Hide ads switches and the Dynamic filtering (A / B / N) cells.
3) Add `||example.com^` under Settings > My Filters and confirm requests to example.com are blocked.
4) Verify that Settings > Backup exports and imports settings locally.
5) On a site that shows an anti-adblock notice (e.g. Letterboxd), confirm the notice disappears and the page stays interactive.

Filter lists are fetched from public URLs as data only; no remote code is executed and no user data is collected or transmitted. Permission justifications are documented in AMO_SUBMISSION.md.

Source: https://github.com/akamusti/Shieldly-Firefox
```

These notes are visible only to you and the reviewers.
