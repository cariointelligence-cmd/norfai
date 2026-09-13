# Discovery log

query: PRH YTJ open data API v3 companies avoindata.prh.fi
where: web
date: 2026-09-12
kept: ytj, ytj-postcodes, prh-xbrl, ytj-all-companies-zip
rejected: prh-bis-v1 (superseded by v3)

query: API Registered notifications PRH krek swagger-ui
where: web
date: 2026-09-12
kept: prh-krek (candidate)
rejected: guessed /opendata-krek-api/v1/notices (HTTP 404)

query: Työmarkkinatori API avoin data työpaikat
where: web
date: 2026-09-12
kept: none
rejected: tyomarkkinatori-api (KEHA credentials required)

query: Finnish Transparency Register API avoindata.fi
where: catalog
date: 2026-09-12
kept: avoimuusrekisteri (candidate, lobbying not ICP discovery)
rejected: none as wired

query: site:github.com YTJ PRH opendata client MIT
where: github
date: 2026-09-12
kept: none
rejected: Miksus/finnish_business_portal (BIS v1), pexxi/prh-ytj (parallel TS client), ivuorinen/business-data-fetcher (PHP)

query: YTJ v3 companies?businessId=0112038-9
where: live
date: 2026-09-12
kept: registeredEntries, euId, lastModified, companySituations
rejected: invented revenue (not in payload)

query: site:proff.fi Y-tunnus toimialahaku robots.txt
where: web
date: 2026-09-12
kept: proff (first-page name/industry HTML), asiakastieto public company cards
rejected: /segmentointi?* (robots Disallow), paginated query strings, Asiakastieto commercial REST (credentials)

query: Wikidata P3608 EU VAT Finnish Y-tunnus P3228 STEL
where: live/docs
date: 2026-09-12
kept: P3608 → fromVatId
rejected: P3228 STEL as Finnish business id
