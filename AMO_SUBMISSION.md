# AMO submission notes

Bu dosya addons.mozilla.org (AMO) inceleme formunu doldururken kullanılır.
Kod minimize/obfuscate edilmemiştir; kaynak paket isteğe bağlıdır (yine de
release'de bulunur).

## Manifest durumu

- `manifest_version: 3`
- `browser_specific_settings.gecko.id`: `privacy-shield@privacy-shield`
- `browser_specific_settings.gecko.strict_min_version`: `140.0`
- `browser_specific_settings.gecko.data_collection_permissions.required`: `["none"]`
- `browser_specific_settings.gecko_android.strict_min_version`: `142.0`
- Host erişimi yalnızca `host_permissions` içinde; `permissions` içinde `<all_urls>` yok.

Doğrulama:

```bash
npm run lint:amo     # web-ext lint
```

## İzin gerekçeleri (AMO formuna kopyalanabilir)

| Permission | Neden gerekli |
| --- | --- |
| `storage` | Kullanıcı ayarları, filtre listeleri, site istisnaları ve sayaçlar yalnızca yerel `storage.local` içinde tutulur. |
| `tabs` | Aktif sekmenin hostname'ini okumak, ayar değişince sekmeyi yenilemek ve options sayfasını açmak için. |
| `webRequest` | Üçüncü taraf isteklerini gözlemleyip engellemek, izleme parametrelerini temizlemek ve başlık değiştirmek için. |
| `webRequestBlocking` | Firefox MV3'te hâlâ desteklenir; istek iptali ve `onHeadersReceived` değişiklikleri bununla yapılır. Reklam/izleyici engellemenin çekirdeği budur. |
| `privacy` | Kullanıcı açtığında `privacy.network.webRTCIPHandlingPolicy` ile WebRTC'yi relay moduna almak için. |
| `menus` | Sağ tık menüsüne "Block element" girdisini eklemek için. |
| `<all_urls>` (host permission) | İçerik scripti tüm sitelerde çalışmalı ve istek filtrelemesi tüm siteleri kapsamalı. Kullanıcı MV3Extensions button ile site bazında kapatabilir. |

## Veri toplama

Eklenti **hiçbir kullanıcı verisini harici bir sunucuya göndermez** ve
telemetri içermez. Bu nedenle `data_collection_permissions.required: ["none"]`
beyan edilmiştir.

Filtre listeleri herkese açık URL'lerden **indirilir** (yalnızca gelen veri);
listeler çalıştırılabilir kod değil, veri olarak ayrıştırılır. Liste kaynakları
ve lisansları core repodaki `README.md` / `ARCHITECTURE.md` dosyalarında takip
edilir.

## Paketleme ve yükleme

AMO, manifest'in zip'in **kökünde** olmasını bekler. Release zip'i bu düzende
üretilir:

```bash
cd apps/extension
zip -r ../../privacy-shield-firefox-0.9.3-amo.zip .
```

Ardından Developer Hub'da:

1. Yeni add-on → listed (herkese açık) veya unlisted (self-distributed) seç.
2. `privacy-shield-firefox-0.9.3-amo.zip` dosyasını yükle.
3. Permission justification alanlarına yukarıdaki tabloyu kopyala.
4. Data collection sorusunda "No data is collected or transmitted" seç (manifest zaten `none` diyor).
5. Kaynak paket istenirse `privacy-shield-firefox-0.9.3-source.zip` dosyasını yükle.
6. İmzalanmış `.xpi` dosyasını AMO'dan indir; doğrudan Firefox'a sürükle-bırak ile kur.

## Yayın notu

Eklenti GPL-3.0 lisanslıdır. `adblock-rust` ve filtre listelerinin lisansları
ayrı takip edilir; kesin lisans kararı insan onayına bağlıdır (bkz. core
`AGENTS.md` madde 8).
