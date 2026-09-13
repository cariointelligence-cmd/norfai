# HIVE

Norf-kerrosten kartta. Päivitä kun lähde tai moottori muuttuu.

## Tarkoitus

Löytää oikeita yrityksiä virallisista rekistereistä, rikastaa ne julkisilta sivuilta, säilyttää kenttäkohtainen provenienssi ja pisteyttää ne hakukriteereitä vasten. Yritystä, henkilöä, sähköpostia, puhelinta tai tilastoa ei keksitä.

## Live-polku

Sensor `ytj` → Memory `companies` + `observations` → Cortex `scoreCompany` / `diagnoseRegisterEmpty` → Face `/sources`, yrityssivu ja hakuaajo (`summary.diagnosis`).

Esimerkki, ajettu 2026-09-12:

1. Sensor kutsuu `https://avoindata.prh.fi/opendata-ytj-api/v3/companies?businessId=0112038-9`.
2. Vastaus on Nokia Oyj. Kentät `registeredEntries` (ALV, työnantaja, ennakkoperintä, kaupparekisteri) ja `euId` FIFPRO.0112038-9 tallennetaan havaintoina. Liikevaihtoa ei ole payloadissa, joten sitä ei keksitä.
3. Memoryyn syntyy `companies`-rivi ja `observations` (business_id, vat_register, employer_register, …).
4. Cortex pisteyttää kriteereitä vasten vasta kun scrape on ajettu.
5. Face `/sources` näyttää viimeisimmän rekisteriyhteyden (lähde, latenssi, aika), ei katalogin "Online"-tarraa.

Julkinen pulssi: etusivun esimerkkihaku kutsuu saman YTJ-healthin. Luku ei ole arvottu 420.

## Lähteet

| id | type | status | freshness | notes |
|---|---|---|---|---|
| ytj | api | wired | 1d | PRH YTJ v3, virallinen ensin |
| ytj-postcodes | api | accepted | 7d | post_codes?lang=1 |
| prh-xbrl | api | wired | 1d | Tyhjä = UNAVAILABLE |
| prh-krek | api | candidate | 1d | Ilmoitukset, JSON-polku ei vahvistettu |
| brreg | api | wired | 1d | NACE + orgnr |
| cvr | api | wired | 1d | Nimi vain |
| gleif | api | wired | 1d | Vain erottuva toiminimi |
| vies | api | wired | 7d | ALV-tarkistus |
| ted / hilma | api | wired | 1d | Hankintasignaalit |
| finder / kauppalehti / northdata / proff / asiakastieto | html | wired | 1d | Y-tunnus → YTJ-hydrate. Proff ei hae /segmentointi. |
| wikidata / nominatim | api | wired | 7d | Vain erottuva nimi / POI. Hydrate YTJ:llä. |
| website | html | wired | 7d | robots.txt, scrape-portti |
| tyomarkkinatori-api | api | rejected | — | Vaatii KEHA-tunnukset |
| prh-bis-v1 | api | rejected | — | YTJ v3 korvaa |

Täysi rekisteri: `hive/source-registry.yaml`.

## Moottorit

| id | input | output | fallback |
|---|---|---|---|
| ytjDiscover | SearchCriteria | DiscoveredCompany[] | skip-seen, pala jatkuu |
| homemadeRegisterDiscover | criteria + disabled | HomemadeHit[] | hive-suunnitelma reitittää, virallinen hydrate, kriteeriportti |
| planRegisterQuery | SearchCriteria | must/should/must_not + lähteet | must-ehtoja ei löysennetä |
| diagnoseRegisterEmpty | plan + source_report | reason code | Face empty copy |
| faceRegisterDiagnosis | source_report | FaceDiagnosis | sanitizer preserves code |
| scoreCompany | ScoreInput | 0–100 + selite | scrape-gate pakollinen |
| targeting.matchTarget | CompanyIntel | match / miss | ei keksittyjä lukuja |

## Liput ja kill-switch

| flag | default | effect |
|---|---|---|
| source_health.enabled | true avoimille | false → Sensor ei aja, Face ei kaadu |
| scrape-gate | pakollinen | score ei etene ennen scrape done/failed |

Kill-switch on admin Data network → Kill. Pipeline lukee `source_health.enabled` discoverissa.

## Riskit

- YTJ schema-drift `registeredEntries` / `companySituations`
- PRH iXBRL usein tyhjä
- Finder/Kauppalehti/Proff HTML voi muuttua; virallinen hydrate on suodatin
- Proff /segmentointi on robots-kielletty; parser version 1
- PRH krek-ilmoitukset candidate kunnes live JSON löytyy
