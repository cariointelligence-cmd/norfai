import { normalizeName } from "./normalize.ts";


export type Municipality = {
  code: string;
  name: string;
  nameSv?: string;
  region: string;
  lat: number;
  lng: number;
};

export const MUNICIPALITIES: Municipality[] = [
  { code: "091", name: "Helsinki", nameSv: "Helsingfors", region: "Uusimaa", lat: 60.1699, lng: 24.9384 },
  { code: "049", name: "Espoo", nameSv: "Esbo", region: "Uusimaa", lat: 60.2055, lng: 24.6559 },
  { code: "092", name: "Vantaa", nameSv: "Vanda", region: "Uusimaa", lat: 60.2934, lng: 25.0378 },
  { code: "837", name: "Tampere", nameSv: "Tammerfors", region: "Pirkanmaa", lat: 61.4978, lng: 23.761 },
  { code: "853", name: "Turku", nameSv: "Åbo", region: "Southwest Finland", lat: 60.4518, lng: 22.2666 },
  { code: "564", name: "Oulu", nameSv: "Uleåborg", region: "North Ostrobothnia", lat: 65.0121, lng: 25.4651 },
  { code: "179", name: "Jyväskylä", region: "Central Finland", lat: 62.2426, lng: 25.7473 },
  { code: "297", name: "Kuopio", region: "North Savo", lat: 62.8924, lng: 27.677 },
  { code: "398", name: "Lahti", nameSv: "Lahtis", region: "Päijät-Häme", lat: 60.9827, lng: 25.6615 },
  { code: "609", name: "Pori", nameSv: "Björneborg", region: "Satakunta", lat: 61.4851, lng: 21.7974 },
  { code: "286", name: "Kouvola", region: "Kymenlaakso", lat: 60.8681, lng: 26.7042 },
  { code: "167", name: "Joensuu", region: "North Karelia", lat: 62.601, lng: 29.7636 },
  { code: "405", name: "Lappeenranta", nameSv: "Villmanstrand", region: "South Karelia", lat: 61.0583, lng: 28.1876 },
  { code: "109", name: "Hämeenlinna", nameSv: "Tavastehus", region: "Kanta-Häme", lat: 60.995, lng: 24.464 },
  { code: "905", name: "Vaasa", nameSv: "Vasa", region: "Ostrobothnia", lat: 63.096, lng: 21.6158 },
  { code: "755", name: "Rovaniemi", region: "Lapland", lat: 66.5039, lng: 25.7294 },
  { code: "837", name: "Seinäjoki", region: "South Ostrobothnia", lat: 62.7903, lng: 22.8403 },
  { code: "444", name: "Mikkeli", nameSv: "S:t Michel", region: "South Savo", lat: 61.6886, lng: 27.272 },
  { code: "272", name: "Kotka", region: "Kymenlaakso", lat: 60.4666, lng: 26.9458 },
  { code: "734", name: "Salo", region: "Southwest Finland", lat: 60.3833, lng: 23.1333 },
  { code: "598", name: "Porvoo", nameSv: "Borgå", region: "Uusimaa", lat: 60.3932, lng: 25.665 },
  { code: "106", name: "Hyvinkää", nameSv: "Hyvinge", region: "Uusimaa", lat: 60.6333, lng: 24.8667 },
  { code: "694", name: "Riihimäki", region: "Kanta-Häme", lat: 60.738, lng: 24.777 },
  { code: "434", name: "Lohja", nameSv: "Lojo", region: "Uusimaa", lat: 60.25, lng: 24.0667 },
  { code: "536", name: "Nokia", region: "Pirkanmaa", lat: 61.478, lng: 23.505 },
  { code: "604", name: "Pirkkala", nameSv: "Birkala", region: "Pirkanmaa", lat: 61.461, lng: 23.65 },
  { code: "980", name: "Ylöjärvi", region: "Pirkanmaa", lat: 61.556, lng: 23.597 },
  { code: "211", name: "Kangasala", region: "Pirkanmaa", lat: 61.4639, lng: 24.076 },
  { code: "418", name: "Lempäälä", region: "Pirkanmaa", lat: 61.3139, lng: 23.7528 },
  { code: "562", name: "Orivesi", region: "Pirkanmaa", lat: 61.6778, lng: 24.3569 },
  { code: "108", name: "Hämeenkyrö", region: "Pirkanmaa", lat: 61.6667, lng: 23.2 },
  { code: "250", name: "Ikaalinen", region: "Pirkanmaa", lat: 61.7694, lng: 23.0681 },
  { code: "702", name: "Ruovesi", region: "Pirkanmaa", lat: 61.9833, lng: 24.0667 },
  { code: "922", name: "Vesilahti", region: "Pirkanmaa", lat: 61.3167, lng: 23.6167 },
  { code: "020", name: "Akaa", region: "Pirkanmaa", lat: 61.1667, lng: 23.8681 },
  { code: "837", name: "Sastamala", region: "Pirkanmaa", lat: 61.3417, lng: 22.9083 },
  { code: "980", name: "Valkeakoski", region: "Pirkanmaa", lat: 61.2667, lng: 24.0306 },
  { code: "211", name: "Järvenpää", nameSv: "Träskända", region: "Uusimaa", lat: 60.4722, lng: 25.0897 },
  { code: "245", name: "Kerava", nameSv: "Kervo", region: "Uusimaa", lat: 60.403, lng: 25.105 },
  { code: "505", name: "Nurmijärvi", region: "Uusimaa", lat: 60.4625, lng: 24.8083 },
  { code: "858", name: "Tuusula", nameSv: "Tusby", region: "Uusimaa", lat: 60.403, lng: 25.029 },
  { code: "753", name: "Sipoo", nameSv: "Sibbo", region: "Uusimaa", lat: 60.377, lng: 25.269 },
  { code: "235", name: "Kauniainen", nameSv: "Grankulla", region: "Uusimaa", lat: 60.21, lng: 24.726 },
  { code: "257", name: "Kirkkonummi", nameSv: "Kyrkslätt", region: "Uusimaa", lat: 60.123, lng: 24.439 },
  { code: "927", name: "Vihti", nameSv: "Vichtis", region: "Uusimaa", lat: 60.4167, lng: 24.3333 },
  { code: "186", name: "Järvenpää", region: "Uusimaa", lat: 60.4736, lng: 25.091 },
  { code: "142", name: "Imatra", region: "South Karelia", lat: 61.17, lng: 28.776 },
  { code: "580", name: "Pieksämäki", region: "South Savo", lat: 62.3, lng: 27.158 },
  { code: "732", name: "Savonlinna", nameSv: "Nyslott", region: "South Savo", lat: 61.868, lng: 28.886 },
  { code: "205", name: "Kajaani", nameSv: "Kajana", region: "Kainuu", lat: 64.227, lng: 27.728 },
  { code: "698", name: "Raahe", nameSv: "Brahestad", region: "North Ostrobothnia", lat: 64.684, lng: 24.479 },
  { code: "837", name: "Kokkola", nameSv: "Karleby", region: "Central Ostrobothnia", lat: 63.838, lng: 23.131 },
  { code: "430", name: "Lohja", region: "Uusimaa", lat: 60.248, lng: 24.065 },
  { code: "529", name: "Nivala", region: "North Ostrobothnia", lat: 63.929, lng: 24.961 },
  { code: "845", name: "Tornio", nameSv: "Torneå", region: "Lapland", lat: 65.848, lng: 24.147 },
  { code: "148", name: "Inari", nameSv: "Enare", region: "Lapland", lat: 68.906, lng: 27.029 },
  { code: "320", name: "Kemijärvi", region: "Lapland", lat: 66.714, lng: 27.431 },
  { code: "240", name: "Kemi", region: "Lapland", lat: 65.736, lng: 24.563 },
  { code: "837", name: "Rauma", nameSv: "Raumo", region: "Satakunta", lat: 61.127, lng: 21.511 },
  { code: "761", name: "Raisio", nameSv: "Reso", region: "Southwest Finland", lat: 60.4858, lng: 22.169 },
  { code: "202", name: "Kaarina", nameSv: "S:t Karins", region: "Southwest Finland", lat: 60.407, lng: 22.372 },
  { code: "503", name: "Naantali", nameSv: "Nådendal", region: "Southwest Finland", lat: 60.466, lng: 22.026 },
  { code: "529", name: "Loimaa", region: "Southwest Finland", lat: 60.851, lng: 23.058 },
  { code: "430", name: "Lieto", nameSv: "Lundo", region: "Southwest Finland", lat: 60.505, lng: 22.461 },
  { code: "075", name: "Forssa", region: "Kanta-Häme", lat: 60.814, lng: 23.621 },
  { code: "109", name: "Hattula", region: "Kanta-Häme", lat: 61.056, lng: 24.371 },
  { code: "016", name: "Asikkala", region: "Päijät-Häme", lat: 61.216, lng: 25.5 },
  { code: "081", name: "Heinola", region: "Päijät-Häme", lat: 61.203, lng: 26.038 },
  { code: "098", name: "Hollola", region: "Päijät-Häme", lat: 60.987, lng: 25.527 },
  { code: "499", name: "Mäntsälä", region: "Uusimaa", lat: 60.636, lng: 25.319 },
  { code: "611", name: "Pornainen", region: "Uusimaa", lat: 60.475, lng: 25.375 },
  { code: "149", name: "Inkoo", nameSv: "Ingå", region: "Uusimaa", lat: 60.046, lng: 24.005 },
  { code: "710", name: "Raasepori", nameSv: "Raseborg", region: "Uusimaa", lat: 59.975, lng: 23.436 },
  { code: "304", name: "Hanko", nameSv: "Hangö", region: "Uusimaa", lat: 59.833, lng: 22.95 },
  { code: "440", name: "Loviisa", nameSv: "Lovisa", region: "Uusimaa", lat: 60.457, lng: 26.225 },
  { code: "407", name: "Lapua", nameSv: "Lappo", region: "South Ostrobothnia", lat: 62.969, lng: 23.008 },
  { code: "301", name: "Kauhava", region: "South Ostrobothnia", lat: 63.101, lng: 23.064 },
  { code: "232", name: "Kauhajoki", region: "South Ostrobothnia", lat: 62.433, lng: 22.183 },
  { code: "005", name: "Alajärvi", region: "South Ostrobothnia", lat: 63.0, lng: 23.824 },
  { code: "145", name: "Ilmajoki", region: "South Ostrobothnia", lat: 62.732, lng: 22.567 },
  { code: "075", name: "Alavus", region: "South Ostrobothnia", lat: 62.586, lng: 23.619 },
  { code: "265", name: "Kittilä", region: "Lapland", lat: 67.655, lng: 24.907 },
  { code: "698", name: "Sodankylä", region: "Lapland", lat: 67.42, lng: 26.589 },
  { code: "148", name: "Enontekiö", region: "Lapland", lat: 68.385, lng: 23.632 },
  { code: "261", name: "Iisalmi", nameSv: "Idensalmi", region: "North Savo", lat: 63.559, lng: 27.188 },
  { code: "915", name: "Varkaus", region: "North Savo", lat: 62.315, lng: 27.873 },
  { code: "140", name: "Siilinjärvi", region: "North Savo", lat: 63.075, lng: 27.66 },
  { code: "422", name: "Lieksa", region: "North Karelia", lat: 63.317, lng: 30.017 },
  { code: "541", name: "Nurmes", region: "North Karelia", lat: 63.543, lng: 29.14 },
  { code: "260", name: "Kitee", region: "North Karelia", lat: 62.099, lng: 30.138 },
];

export type Industry = {
  code: string;
  labelFi: string;
  labelEn: string;
  parent?: string;
};

export const INDUSTRIES: Industry[] = [
  { code: "01", labelFi: "Maatalous ja metsästys", labelEn: "Crop and animal production" },
  { code: "02", labelFi: "Metsätalous", labelEn: "Forestry" },
  { code: "03", labelFi: "Kalastus", labelEn: "Fishing" },
  { code: "05", labelFi: "Kivihiilen ja ruskohiilen kaivu", labelEn: "Mining of coal" },
  { code: "06", labelFi: "Raakaöljyn ja maakaasun tuotanto", labelEn: "Extraction of crude petroleum" },
  { code: "07", labelFi: "Metallimalmien louhinta", labelEn: "Mining of metal ores" },
  { code: "08", labelFi: "Muu kaivostoiminta", labelEn: "Other mining" },
  { code: "10", labelFi: "Elintarvikkeiden valmistus", labelEn: "Food manufacturing" },
  { code: "11", labelFi: "Juomien valmistus", labelEn: "Beverages" },
  { code: "13", labelFi: "Tekstiilien valmistus", labelEn: "Textiles" },
  { code: "14", labelFi: "Vaatteiden valmistus", labelEn: "Wearing apparel" },
  { code: "16", labelFi: "Puun sahaus ja höyläys", labelEn: "Wood products" },
  { code: "17", labelFi: "Paperin valmistus", labelEn: "Paper" },
  { code: "18", labelFi: "Painaminen", labelEn: "Printing" },
  { code: "20", labelFi: "Kemikaalien valmistus", labelEn: "Chemicals" },
  { code: "21", labelFi: "Lääkeaineiden valmistus", labelEn: "Pharmaceuticals" },
  { code: "22", labelFi: "Kumi- ja muovituotteet", labelEn: "Rubber and plastic" },
  { code: "23", labelFi: "Muiden ei-metallisten mineraalituotteiden valmistus", labelEn: "Non-metallic mineral products" },
  { code: "24", labelFi: "Metallien jalostus", labelEn: "Basic metals" },
  { code: "25", labelFi: "Metallituotteiden valmistus", labelEn: "Fabricated metal products" },
  { code: "26", labelFi: "Tietokoneet ja elektroniset tuotteet", labelEn: "Computers and electronics" },
  { code: "27", labelFi: "Sähkölaitteiden valmistus", labelEn: "Electrical equipment" },
  { code: "28", labelFi: "Muiden koneiden ja laitteiden valmistus", labelEn: "Machinery" },
  { code: "29", labelFi: "Moottoriajoneuvojen valmistus", labelEn: "Motor vehicles" },
  { code: "31", labelFi: "Huonekalujen valmistus", labelEn: "Furniture" },
  { code: "32", labelFi: "Muu valmistus", labelEn: "Other manufacturing" },
  { code: "33", labelFi: "Koneiden ja laitteiden korjaus", labelEn: "Repair of machinery" },
  { code: "35", labelFi: "Sähkö-, kaasu- ja lämpöhuolto", labelEn: "Electricity, gas, steam" },
  { code: "36", labelFi: "Veden otto, puhdistus ja jakelu", labelEn: "Water collection" },
  { code: "37", labelFi: "Viemäri- ja jätevesihuolto", labelEn: "Sewerage" },
  { code: "38", labelFi: "Jätteen keruu ja käsittely", labelEn: "Waste collection" },
  { code: "41", labelFi: "Talonrakentaminen", labelEn: "Construction of buildings" },
  { code: "41100", labelFi: "Rakennuttaminen", labelEn: "Development of building projects", parent: "41" },
  { code: "41200", labelFi: "Asuin- ja muiden rakennusten rakentaminen", labelEn: "Construction of residential and non-residential buildings", parent: "41" },
  { code: "42", labelFi: "Maa- ja vesirakentaminen", labelEn: "Civil engineering" },
  { code: "42110", labelFi: "Teiden ja moottoriteiden rakentaminen", labelEn: "Construction of roads", parent: "42" },
  { code: "42210", labelFi: "Yhdyskuntateknisten verkkojen rakentaminen", labelEn: "Utility projects", parent: "42" },
  { code: "43", labelFi: "Erikoistunut rakennustoiminta", labelEn: "Specialised construction" },
  { code: "43120", labelFi: "Maa- ja vesirakennusalan pohjatyöt", labelEn: "Site preparation", parent: "43" },
  { code: "43210", labelFi: "Sähköasennus", labelEn: "Electrical installation", parent: "43" },
  { code: "43220", labelFi: "Lämpö-, vesijohto- ja ilmastointiasennus", labelEn: "Plumbing, heat and air-conditioning", parent: "43" },
  { code: "43221", labelFi: "Lämmitys- ja ilmanvaihtoasennus", labelEn: "HVAC installation", parent: "43" },
  { code: "43310", labelFi: "Rappaus", labelEn: "Plastering", parent: "43" },
  { code: "43320", labelFi: "Rakennuspuusepän asennustyöt", labelEn: "Joinery installation", parent: "43" },
  { code: "43330", labelFi: "Lattianpäällystys ja seinien verhous", labelEn: "Floor and wall covering", parent: "43" },
  { code: "43341", labelFi: "Maalaus", labelEn: "Painting", parent: "43" },
  { code: "43910", labelFi: "Kattaminen", labelEn: "Roofing", parent: "43" },
  { code: "43991", labelFi: "Kattoristikoiden ja vastaavien asennus", labelEn: "Roof truss installation", parent: "43" },
  { code: "45", labelFi: "Moottoriajoneuvojen kauppa ja korjaus", labelEn: "Motor vehicle trade" },
  { code: "46", labelFi: "Tukkukauppa", labelEn: "Wholesale" },
  { code: "47", labelFi: "Vähittäiskauppa", labelEn: "Retail" },
  { code: "49", labelFi: "Maaliikenne", labelEn: "Land transport" },
  { code: "50", labelFi: "Vesiliikenne", labelEn: "Water transport" },
  { code: "51", labelFi: "Ilmaliikenne", labelEn: "Air transport" },
  { code: "52", labelFi: "Varastointi ja liikennettä palveleva toiminta", labelEn: "Warehousing" },
  { code: "53", labelFi: "Posti- ja kuriiritoiminta", labelEn: "Postal and courier" },
  { code: "55", labelFi: "Majoitus", labelEn: "Accommodation" },
  { code: "56", labelFi: "Ravitsemistoiminta", labelEn: "Food and beverage service" },
  { code: "58", labelFi: "Kustannustoiminta", labelEn: "Publishing" },
  { code: "59", labelFi: "Elokuva, video ja TV", labelEn: "Motion picture and TV" },
  { code: "60", labelFi: "Radio- ja televisiotoiminta", labelEn: "Broadcasting" },
  { code: "61", labelFi: "Televiestintä", labelEn: "Telecommunications" },
  { code: "62", labelFi: "Ohjelmistot, konsultointi ja tietotekniikka", labelEn: "Computer programming and consultancy" },
  { code: "62100", labelFi: "Ohjelmistojen suunnittelu ja valmistus", labelEn: "Computer programming activities", parent: "62" },
  { code: "62200", labelFi: "Tietojenkäsittelyn ja laitteistojen konsultointi", labelEn: "Computer consultancy and facilities", parent: "62" },
  { code: "62900", labelFi: "Muu tietotekniikka", labelEn: "Other information technology", parent: "62" },
  { code: "62010", labelFi: "Ohjelmistojen suunnittelu ja valmistus (TOL 2008)", labelEn: "Computer programming (TOL 2008)", parent: "62" },
  { code: "62020", labelFi: "Tietojenkäsittelyn ja laitteistojen konsultointi (TOL 2008)", labelEn: "Computer consultancy (TOL 2008)", parent: "62" },
  { code: "62030", labelFi: "Tietokoneiden käyttö- ja hallintapalvelut (TOL 2008)", labelEn: "Computer facilities management (TOL 2008)", parent: "62" },
  { code: "62090", labelFi: "Muu tietotekniikka (TOL 2008)", labelEn: "Other information technology (TOL 2008)", parent: "62" },

  { code: "63", labelFi: "Tietopalvelutoiminta", labelEn: "Information service activities" },
  { code: "63100", labelFi: "Tietojenkäsittely ja palvelintila", labelEn: "Data processing and hosting", parent: "63" },
  { code: "63900", labelFi: "Muu tietopalvelutoiminta", labelEn: "Other information service activities", parent: "63" },
  { code: "63110", labelFi: "Tietojenkäsittely, palvelintila- ja niihin liittyvät palvelut (TOL 2008)", labelEn: "Data processing and hosting (TOL 2008)", parent: "63" },
  { code: "63120", labelFi: "Verkkoportaalit (TOL 2008)", labelEn: "Web portals (TOL 2008)", parent: "63" },
  { code: "63910", labelFi: "Uutistoimistot (TOL 2008)", labelEn: "News agency activities (TOL 2008)", parent: "63" },
  { code: "63990", labelFi: "Muu tietopalvelutoiminta (TOL 2008)", labelEn: "Other information service activities (TOL 2008)", parent: "63" },
  { code: "64", labelFi: "Rahoituspalvelut", labelEn: "Financial services" },
  { code: "65", labelFi: "Vakuutustoiminta", labelEn: "Insurance" },
  { code: "66", labelFi: "Rahoitusta ja vakuuttamista palveleva toiminta", labelEn: "Auxiliary financial services" },
  { code: "68", labelFi: "Kiinteistöalan toiminta", labelEn: "Real estate" },
  { code: "69", labelFi: "Lakiasiain- ja laskentatoimen palvelut", labelEn: "Legal and accounting" },
  { code: "70", labelFi: "Pääkonttorit ja hallintopalvelut", labelEn: "Head offices and management consultancy" },
  { code: "70100", labelFi: "Pääkonttorien toiminta", labelEn: "Activities of head offices", parent: "70" },
  { code: "70200", labelFi: "Liikkeenjohdon konsultointi", labelEn: "Management consultancy", parent: "70" },
  { code: "70220", labelFi: "Muu liikkeenjohdon konsultointi (TOL 2008)", labelEn: "Business and other management consultancy (TOL 2008)", parent: "70" },
  { code: "71", labelFi: "Arkkitehti- ja insinööripalvelut", labelEn: "Architectural and engineering" },
  { code: "72", labelFi: "Tieteellinen tutkimus ja kehittäminen", labelEn: "Scientific R&D" },
  { code: "73", labelFi: "Mainostoiminta ja markkinatutkimus", labelEn: "Advertising and market research" },
  { code: "73111", labelFi: "Mainostoimistojen toiminta", labelEn: "Advertising agencies", parent: "73" },
  { code: "73112", labelFi: "Suora- ja ulkomainonta", labelEn: "Direct and outdoor advertising", parent: "73" },
  { code: "73120", labelFi: "Median edustustilojen myynti", labelEn: "Media representation", parent: "73" },
  { code: "73200", labelFi: "Markkinatutkimus ja mielipidetutkimus", labelEn: "Market research", parent: "73" },

  { code: "74", labelFi: "Muut erikoistuneet liike-elämän palvelut", labelEn: "Other professional services" },
  { code: "75", labelFi: "Eläinlääkintäpalvelut", labelEn: "Veterinary" },
  { code: "77", labelFi: "Vuokraus- ja leasingtoiminta", labelEn: "Rental and leasing" },
  { code: "78", labelFi: "Työllistämistoiminta", labelEn: "Employment activities" },
  { code: "79", labelFi: "Matkatoimistot", labelEn: "Travel agencies" },
  { code: "80", labelFi: "Turvallisuuspalvelut", labelEn: "Security" },
  { code: "81", labelFi: "Kiinteistön- ja maisemanhoito", labelEn: "Services to buildings and landscape" },
  { code: "82", labelFi: "Hallinto- ja tukipalvelut", labelEn: "Office administration" },
  { code: "84", labelFi: "Julkinen hallinto", labelEn: "Public administration" },
  { code: "85", labelFi: "Koulutus", labelEn: "Education" },
  { code: "86", labelFi: "Terveyspalvelut", labelEn: "Human health" },
  { code: "87", labelFi: "Sosiaalihuollon laitospalvelut", labelEn: "Residential care" },
  { code: "88", labelFi: "Sosiaalihuollon avopalvelut", labelEn: "Social work" },
  { code: "90", labelFi: "Kulttuuri- ja viihdetoiminta", labelEn: "Creative arts" },
  { code: "91", labelFi: "Kirjastot, arkistot, museot", labelEn: "Libraries and museums" },
  { code: "93", labelFi: "Urheilu ja virkistys", labelEn: "Sports and recreation" },
  { code: "94", labelFi: "Järjestöjen toiminta", labelEn: "Membership organisations" },
  { code: "95", labelFi: "Tietokoneiden ja henkilökohtaisten tavaroiden korjaus", labelEn: "Repair of computers" },
  { code: "96", labelFi: "Muu henkilökohtainen palvelutoiminta", labelEn: "Other personal service" },
  { code: "09", labelFi: "Kaivostoimintaa palveleva toiminta", labelEn: "Mining support" },
  { code: "12", labelFi: "Tupakkatuotteiden valmistus", labelEn: "Tobacco" },
  { code: "15", labelFi: "Nahan ja nahkatuotteiden valmistus", labelEn: "Leather" },
  { code: "19", labelFi: "Koksin ja öljytuotteiden valmistus", labelEn: "Coke and refined petroleum" },
  { code: "30", labelFi: "Muiden kulkuneuvojen valmistus", labelEn: "Other transport equipment" },
  { code: "39", labelFi: "Maaperän ja vesistöjen kunnostus", labelEn: "Remediation" },
  { code: "92", labelFi: "Rahapeli- ja vedonlyöntitoiminta", labelEn: "Gambling and betting" },
  { code: "97", labelFi: "Kotitalouksien toiminta työnantajina", labelEn: "Households as employers" },
  { code: "98", labelFi: "Kotitalouksien omaan käyttöön tuottaminen", labelEn: "Undifferentiated household goods" },
  { code: "99", labelFi: "Kansainvälisten organisaatioiden toiminta", labelEn: "Extraterritorial organisations" },
  { code: "101", labelFi: "Teurastus ja lihanjalostus", labelEn: "Processing of meat", parent: "10" },
  { code: "102", labelFi: "Kalan, äyriäisten ja nilviäisten jalostus", labelEn: "Processing of fish", parent: "10" },
  { code: "103", labelFi: "Hedelmien ja kasvisten jalostus", labelEn: "Processing of fruit and vegetables", parent: "10" },
  { code: "104", labelFi: "Kasvi- ja eläinöljyjen valmistus", labelEn: "Vegetable and animal oils", parent: "10" },
  { code: "105", labelFi: "Maitotaloustuotteiden valmistus", labelEn: "Dairy", parent: "10" },
  { code: "106", labelFi: "Myllytuotteiden valmistus", labelEn: "Grain mill products", parent: "10" },
  { code: "107", labelFi: "Leipomotuotteiden valmistus", labelEn: "Bakery products", parent: "10" },
  { code: "108", labelFi: "Muiden elintarvikkeiden valmistus", labelEn: "Other food products", parent: "10" },
  { code: "109", labelFi: "Eläinten ruokien valmistus", labelEn: "Prepared animal feeds", parent: "10" },
  { code: "110", labelFi: "Juomien valmistus (3-nro)", labelEn: "Beverages (group)", parent: "11" },
  { code: "131", labelFi: "Tekstiilikuitujen valmistelu ja kehruu", labelEn: "Preparation and spinning of textiles", parent: "13" },
  { code: "139", labelFi: "Muiden tekstiilituotteiden valmistus", labelEn: "Other textiles", parent: "13" },
  { code: "141", labelFi: "Vaatteiden valmistus (pl. turkikset)", labelEn: "Wearing apparel except fur", parent: "14" },
  { code: "151", labelFi: "Nahan parkitseminen ja muokkaus", labelEn: "Tanning of leather", parent: "15" },
  { code: "161", labelFi: "Puun sahaus, höyläys ja kyllästys", labelEn: "Sawmilling", parent: "16" },
  { code: "162", labelFi: "Puutuotteiden valmistus", labelEn: "Products of wood", parent: "16" },
  { code: "171", labelFi: "Massan, paperin ja kartongin valmistus", labelEn: "Pulp, paper and paperboard", parent: "17" },
  { code: "172", labelFi: "Paperi- ja kartonkituotteiden valmistus", labelEn: "Articles of paper", parent: "17" },
  { code: "181", labelFi: "Painaminen", labelEn: "Printing of products", parent: "18" },
  { code: "201", labelFi: "Peruskemikaalien valmistus", labelEn: "Basic chemicals", parent: "20" },
  { code: "202", labelFi: "Torjunta-aineiden valmistus", labelEn: "Pesticides", parent: "20" },
  { code: "203", labelFi: "Maalien ja painovärien valmistus", labelEn: "Paints and printing ink", parent: "20" },
  { code: "204", labelFi: "Saippuan ja pesuaineiden valmistus", labelEn: "Soap and detergents", parent: "20" },
  { code: "205", labelFi: "Muiden kemikaalien valmistus", labelEn: "Other chemicals", parent: "20" },
  { code: "211", labelFi: "Lääkeaineiden valmistus (3-nro)", labelEn: "Basic pharmaceutical products", parent: "21" },
  { code: "221", labelFi: "Kumituotteiden valmistus", labelEn: "Rubber products", parent: "22" },
  { code: "222", labelFi: "Muovituotteiden valmistus", labelEn: "Plastic products", parent: "22" },
  { code: "231", labelFi: "Lasin ja lasituotteiden valmistus", labelEn: "Glass", parent: "23" },
  { code: "235", labelFi: "Sementin valmistus", labelEn: "Cement", parent: "23" },
  { code: "236", labelFi: "Betoni-, kipsi- ja sementtituotteet", labelEn: "Concrete products", parent: "23" },
  { code: "241", labelFi: "Raudan ja teräksen valmistus", labelEn: "Basic iron and steel", parent: "24" },
  { code: "244", labelFi: "Jalometallien valmistus", labelEn: "Precious and other non-ferrous metals", parent: "24" },
  { code: "251", labelFi: "Metallirakenteiden valmistus", labelEn: "Structural metal products", parent: "25" },
  { code: "255", labelFi: "Metallin takominen ja muovaus", labelEn: "Forging and forming of metal", parent: "25" },
  { code: "256", labelFi: "Metallien käsittely ja päällystys", labelEn: "Treatment and coating of metals", parent: "25" },
  { code: "259", labelFi: "Muiden metallituotteiden valmistus", labelEn: "Other fabricated metal products", parent: "25" },
  { code: "261", labelFi: "Elektronisten komponenttien valmistus", labelEn: "Electronic components", parent: "26" },
  { code: "262", labelFi: "Tietokoneiden valmistus", labelEn: "Computers and peripheral equipment", parent: "26" },
  { code: "263", labelFi: "Viestintälaitteiden valmistus", labelEn: "Communication equipment", parent: "26" },
  { code: "265", labelFi: "Mittaus-, testaus- ja navigointilaitteet", labelEn: "Measuring instruments", parent: "26" },
  { code: "271", labelFi: "Sähkömoottoreiden valmistus", labelEn: "Electric motors", parent: "27" },
  { code: "274", labelFi: "Sähkölamppujen valmistus", labelEn: "Electric lighting", parent: "27" },
  { code: "275", labelFi: "Kodinkoneiden valmistus", labelEn: "Domestic appliances", parent: "27" },
  { code: "281", labelFi: "Yleiskäyttöisten koneiden valmistus", labelEn: "General-purpose machinery", parent: "28" },
  { code: "282", labelFi: "Muiden yleiskäyttöisten koneiden valmistus", labelEn: "Other general-purpose machinery", parent: "28" },
  { code: "283", labelFi: "Maatalous- ja metsäkoneiden valmistus", labelEn: "Agricultural machinery", parent: "28" },
  { code: "284", labelFi: "Metallin työstökoneiden valmistus", labelEn: "Metal forming machinery", parent: "28" },
  { code: "289", labelFi: "Muiden erikoiskoneiden valmistus", labelEn: "Other special-purpose machinery", parent: "28" },
  { code: "291", labelFi: "Moottoriajoneuvojen valmistus (3-nro)", labelEn: "Motor vehicles (group)", parent: "29" },
  { code: "292", labelFi: "Korien, perävaunujen valmistus", labelEn: "Bodies and trailers", parent: "29" },
  { code: "293", labelFi: "Moottoriajoneuvojen osien valmistus", labelEn: "Parts for motor vehicles", parent: "29" },
  { code: "301", labelFi: "Laivojen ja veneiden rakentaminen", labelEn: "Ships and boats", parent: "30" },
  { code: "302", labelFi: "Raideliikenteen kaluston valmistus", labelEn: "Railway locomotives", parent: "30" },
  { code: "303", labelFi: "Ilma- ja avaruusalusten valmistus", labelEn: "Air and spacecraft", parent: "30" },
  { code: "310", labelFi: "Huonekalujen valmistus (3-nro)", labelEn: "Furniture (group)", parent: "31" },
  { code: "325", labelFi: "Lääkintä- ja hammaslääkintälaitteet", labelEn: "Medical and dental instruments", parent: "32" },
  { code: "331", labelFi: "Koneiden ja laitteiden korjaus (3-nro)", labelEn: "Repair of fabricated metal products and machinery", parent: "33" },
  { code: "332", labelFi: "Teollisuuden koneiden asennus", labelEn: "Installation of industrial machinery", parent: "33" },
  { code: "351", labelFi: "Sähköntuotanto ja -jakelu", labelEn: "Electric power generation", parent: "35" },
  { code: "352", labelFi: "Kaasun tuotanto ja jakelu", labelEn: "Manufacture of gas", parent: "35" },
  { code: "353", labelFi: "Lämmön ja kylmän tuotanto", labelEn: "Steam and air conditioning supply", parent: "35" },
  { code: "360", labelFi: "Veden otto ja jakelu (3-nro)", labelEn: "Water collection (group)", parent: "36" },
  { code: "381", labelFi: "Jätteen keruu", labelEn: "Waste collection (group)", parent: "38" },
  { code: "382", labelFi: "Jätteen käsittely", labelEn: "Waste treatment", parent: "38" },
  { code: "383", labelFi: "Materiaalien kierrätys", labelEn: "Materials recovery", parent: "38" },
  { code: "411", labelFi: "Rakennuttaminen ja rakennushankkeiden kehittäminen", labelEn: "Development of building projects", parent: "41" },
  { code: "412", labelFi: "Asuin- ja muiden rakennusten rakentaminen", labelEn: "Construction of buildings (group)", parent: "41" },
  { code: "421", labelFi: "Teiden ja rautateiden rakentaminen", labelEn: "Roads and railways", parent: "42" },
  { code: "422", labelFi: "Yhdyskuntateknisten verkkojen rakentaminen", labelEn: "Utility projects (group)", parent: "42" },
  { code: "429", labelFi: "Muu maa- ja vesirakentaminen", labelEn: "Other civil engineering", parent: "42" },
  { code: "431", labelFi: "Purku- ja valmistelutyöt", labelEn: "Demolition and site preparation", parent: "43" },
  { code: "432", labelFi: "Sähkö-, putki- ja muut rakennusasennukset", labelEn: "Electrical, plumbing and other installation", parent: "43" },
  { code: "433", labelFi: "Rakennusten viimeistely", labelEn: "Building completion", parent: "43" },
  { code: "439", labelFi: "Muu erikoistunut rakennustoiminta", labelEn: "Other specialised construction", parent: "43" },
  { code: "451", labelFi: "Moottoriajoneuvojen kauppa", labelEn: "Sale of motor vehicles", parent: "45" },
  { code: "452", labelFi: "Moottoriajoneuvojen huolto ja korjaus", labelEn: "Maintenance of motor vehicles", parent: "45" },
  { code: "453", labelFi: "Moottoriajoneuvojen osien kauppa", labelEn: "Sale of motor vehicle parts", parent: "45" },
  { code: "461", labelFi: "Agentuuritoiminta", labelEn: "Wholesale on a fee or contract basis", parent: "46" },
  { code: "462", labelFi: "Maatalousraaka-aineiden tukkukauppa", labelEn: "Wholesale of agricultural raw materials", parent: "46" },
  { code: "463", labelFi: "Elintarvikkeiden tukkukauppa", labelEn: "Wholesale of food and beverages", parent: "46" },
  { code: "464", labelFi: "Taloustavaroiden tukkukauppa", labelEn: "Wholesale of household goods", parent: "46" },
  { code: "465", labelFi: "Tietotekniikan tukkukauppa", labelEn: "Wholesale of ICT equipment", parent: "46" },
  { code: "466", labelFi: "Koneiden tukkukauppa", labelEn: "Wholesale of other machinery", parent: "46" },
  { code: "467", labelFi: "Muu erikoistunut tukkukauppa", labelEn: "Other specialised wholesale", parent: "46" },
  { code: "469", labelFi: "Muu tukkukauppa", labelEn: "Non-specialised wholesale", parent: "46" },
  { code: "471", labelFi: "Yleinen vähittäiskauppa", labelEn: "Retail in non-specialised stores", parent: "47" },
  { code: "472", labelFi: "Elintarvikkeiden vähittäiskauppa", labelEn: "Retail of food", parent: "47" },
  { code: "473", labelFi: "Polttoaineen vähittäiskauppa", labelEn: "Retail of automotive fuel", parent: "47" },
  { code: "474", labelFi: "Tietotekniikan vähittäiskauppa", labelEn: "Retail of ICT equipment", parent: "47" },
  { code: "475", labelFi: "Taloustavaroiden vähittäiskauppa", labelEn: "Retail of household equipment", parent: "47" },
  { code: "476", labelFi: "Kulttuuri- ja vapaa-ajan tavaroiden vähittäiskauppa", labelEn: "Retail of cultural goods", parent: "47" },
  { code: "477", labelFi: "Muu erikoistunut vähittäiskauppa", labelEn: "Retail of other goods", parent: "47" },
  { code: "479", labelFi: "Postimyynti ja verkkokauppa", labelEn: "Retail via mail order or internet", parent: "47" },
  { code: "491", labelFi: "Rautatieliikenne", labelEn: "Passenger rail", parent: "49" },
  { code: "493", labelFi: "Tieliikenteen henkilöliikenne", labelEn: "Other passenger land transport", parent: "49" },
  { code: "494", labelFi: "Tieliikenteen tavarankuljetus", labelEn: "Freight transport by road", parent: "49" },
  { code: "501", labelFi: "Meriliikenteen henkilökuljetus", labelEn: "Sea passenger transport", parent: "50" },
  { code: "502", labelFi: "Meriliikenteen tavarankuljetus", labelEn: "Sea freight transport", parent: "50" },
  { code: "511", labelFi: "Lentoliikenteen henkilökuljetus", labelEn: "Passenger air transport", parent: "51" },
  { code: "521", labelFi: "Varastointi", labelEn: "Warehousing and storage", parent: "52" },
  { code: "522", labelFi: "Liikennettä palveleva toiminta", labelEn: "Support for transportation", parent: "52" },
  { code: "531", labelFi: "Postin toiminta", labelEn: "Postal activities", parent: "53" },
  { code: "532", labelFi: "Kuriiritoiminta", labelEn: "Courier activities", parent: "53" },
  { code: "551", labelFi: "Hotellit", labelEn: "Hotels", parent: "55" },
  { code: "552", labelFi: "Loma-asunnot ja majatalot", labelEn: "Holiday and other short-stay accommodation", parent: "55" },
  { code: "561", labelFi: "Ravintolat", labelEn: "Restaurants", parent: "56" },
  { code: "562", labelFi: "Pitopalvelu ja ateriapalvelut", labelEn: "Event catering", parent: "56" },
  { code: "563", labelFi: "Baarit ja kahvilat", labelEn: "Beverage serving", parent: "56" },
  { code: "581", labelFi: "Kirjojen ja lehtien kustantaminen", labelEn: "Publishing of books and newspapers", parent: "58" },
  { code: "582", labelFi: "Ohjelmistojen kustantaminen", labelEn: "Software publishing", parent: "58" },
  { code: "591", labelFi: "Elokuva- ja videotoiminta", labelEn: "Motion picture and video", parent: "59" },
  { code: "592", labelFi: "Äänitteiden tuottaminen", labelEn: "Sound recording", parent: "59" },
  { code: "601", labelFi: "Radiotoiminta", labelEn: "Radio broadcasting", parent: "60" },
  { code: "602", labelFi: "Televisiotoiminta", labelEn: "Television programming", parent: "60" },
  { code: "611", labelFi: "Langallinen televiestintä", labelEn: "Wired telecommunications", parent: "61" },
  { code: "612", labelFi: "Langaton televiestintä", labelEn: "Wireless telecommunications", parent: "61" },
  { code: "619", labelFi: "Muu televiestintä", labelEn: "Other telecommunications", parent: "61" },
  { code: "641", labelFi: "Pankkitoiminta", labelEn: "Monetary intermediation", parent: "64" },
  { code: "642", labelFi: "Holdingyhtiöiden toiminta", labelEn: "Activities of holding companies", parent: "64" },
  { code: "643", labelFi: "Rahastot ja sijoitusyhtiöt", labelEn: "Trusts and funds", parent: "64" },
  { code: "649", labelFi: "Muu rahoituspalvelu", labelEn: "Other financial service", parent: "64" },
  { code: "651", labelFi: "Vakuutustoiminta (3-nro)", labelEn: "Insurance (group)", parent: "65" },
  { code: "653", labelFi: "Eläkesäätiöt", labelEn: "Pension funding", parent: "65" },
  { code: "661", labelFi: "Rahoitusmarkkinoita palveleva toiminta", labelEn: "Activities auxiliary to financial services", parent: "66" },
  { code: "662", labelFi: "Vakuutusta palveleva toiminta", labelEn: "Activities auxiliary to insurance", parent: "66" },
  { code: "681", labelFi: "Omien kiinteistöjen kauppa", labelEn: "Buying and selling of own real estate", parent: "68" },
  { code: "682", labelFi: "Omien kiinteistöjen vuokraus", labelEn: "Renting of own real estate", parent: "68" },
  { code: "683", labelFi: "Kiinteistönvälitys", labelEn: "Real estate agencies", parent: "68" },
  { code: "691", labelFi: "Lakiasiainpalvelut", labelEn: "Legal activities", parent: "69" },
  { code: "692", labelFi: "Laskentatoimen palvelut", labelEn: "Accounting and auditing", parent: "69" },
  { code: "711", labelFi: "Arkkitehti- ja insinööripalvelut (3-nro)", labelEn: "Architectural and engineering (group)", parent: "71" },
  { code: "712", labelFi: "Tekninen testaus ja analysointi", labelEn: "Technical testing and analysis", parent: "71" },
  { code: "721", labelFi: "Luonnontieteellinen tutkimus", labelEn: "Research in natural sciences", parent: "72" },
  { code: "722", labelFi: "Yhteiskuntatieteellinen tutkimus", labelEn: "Research in social sciences", parent: "72" },
  { code: "731", labelFi: "Mainostoiminta", labelEn: "Advertising", parent: "73" },
  { code: "732", labelFi: "Markkina- ja mielipidetutkimus", labelEn: "Market research and public opinion", parent: "73" },
  { code: "741", labelFi: "Muotoilupalvelut", labelEn: "Specialised design", parent: "74" },
  { code: "742", labelFi: "Valokuvaamotoiminta", labelEn: "Photographic activities", parent: "74" },
  { code: "743", labelFi: "Kääntäminen ja tulkkaus", labelEn: "Translation and interpretation", parent: "74" },
  { code: "749", labelFi: "Muu liike-elämää palveleva toiminta", labelEn: "Other professional activities", parent: "74" },
  { code: "771", labelFi: "Moottoriajoneuvojen vuokraus", labelEn: "Renting of motor vehicles", parent: "77" },
  { code: "772", labelFi: "Henkilökohtaisten tavaroiden vuokraus", labelEn: "Renting of personal goods", parent: "77" },
  { code: "773", labelFi: "Koneiden ja laitteiden vuokraus", labelEn: "Renting of machinery", parent: "77" },
  { code: "774", labelFi: "Immateriaalioikeuksien vuokraus", labelEn: "Leasing of intellectual property", parent: "77" },
  { code: "781", labelFi: "Työnvälitys", labelEn: "Activities of employment placement agencies", parent: "78" },
  { code: "782", labelFi: "Työvoiman vuokraus", labelEn: "Temporary employment agency", parent: "78" },
  { code: "783", labelFi: "Muut henkilöstöpalvelut", labelEn: "Other human resources", parent: "78" },
  { code: "791", labelFi: "Matkatoimistot", labelEn: "Travel agency activities", parent: "79" },
  { code: "799", labelFi: "Muut varauspalvelut", labelEn: "Other reservation service", parent: "79" },
  { code: "801", labelFi: "Yksityinen turvallisuuspalvelu", labelEn: "Private security", parent: "80" },
  { code: "802", labelFi: "Turvajärjestelmät", labelEn: "Security systems", parent: "80" },
  { code: "811", labelFi: "Kiinteistönhoito", labelEn: "Combined facilities support", parent: "81" },
  { code: "812", labelFi: "Siivouspalvelut", labelEn: "Cleaning activities", parent: "81" },
  { code: "813", labelFi: "Maisemanhoito", labelEn: "Landscape service", parent: "81" },
  { code: "821", labelFi: "Toimistopalvelut", labelEn: "Office administrative services", parent: "82" },
  { code: "822", labelFi: "Call center -toiminta", labelEn: "Call centres", parent: "82" },
  { code: "823", labelFi: "Messujen ja tapahtumien järjestäminen", labelEn: "Convention and trade show organisers", parent: "82" },
  { code: "829", labelFi: "Muut liike-elämän tukipalvelut", labelEn: "Other business support", parent: "82" },
  { code: "841", labelFi: "Julkishallinto", labelEn: "Public administration (group)", parent: "84" },
  { code: "842", labelFi: "Ulkoasiain- ja puolustushallinto", labelEn: "Foreign affairs and defence", parent: "84" },
  { code: "843", labelFi: "Pakollinen sosiaalivakuutus", labelEn: "Compulsory social security", parent: "84" },
  { code: "851", labelFi: "Esiopetus", labelEn: "Pre-primary education", parent: "85" },
  { code: "852", labelFi: "Perusopetus", labelEn: "Primary education", parent: "85" },
  { code: "853", labelFi: "Toisen asteen koulutus", labelEn: "Secondary education", parent: "85" },
  { code: "854", labelFi: "Korkea-asteen koulutus", labelEn: "Higher education", parent: "85" },
  { code: "855", labelFi: "Muu koulutus", labelEn: "Other education", parent: "85" },
  { code: "856", labelFi: "Koulutusta palveleva toiminta", labelEn: "Educational support", parent: "85" },
  { code: "861", labelFi: "Sairaalat", labelEn: "Hospital activities", parent: "86" },
  { code: "862", labelFi: "Lääkäri- ja hammaslääkäripalvelut", labelEn: "Medical and dental practice", parent: "86" },
  { code: "869", labelFi: "Muut terveyspalvelut", labelEn: "Other human health", parent: "86" },
  { code: "871", labelFi: "Hoitolaitospalvelut", labelEn: "Residential nursing care", parent: "87" },
  { code: "872", labelFi: "Kehitysvammaisten laitospalvelut", labelEn: "Residential care for mental health", parent: "87" },
  { code: "873", labelFi: "Vanhusten ja vammaisten laitospalvelut", labelEn: "Residential care for the elderly", parent: "87" },
  { code: "879", labelFi: "Muu laitoshuolto", labelEn: "Other residential care", parent: "87" },
  { code: "881", labelFi: "Vanhusten avopalvelut", labelEn: "Social work without accommodation for the elderly", parent: "88" },
  { code: "889", labelFi: "Muu avohuolto", labelEn: "Other social work without accommodation", parent: "88" },
  { code: "900", labelFi: "Kulttuuri- ja viihdetoiminta (3-nro)", labelEn: "Creative, arts and entertainment", parent: "90" },
  { code: "910", labelFi: "Kirjastot, arkistot ja museot (3-nro)", labelEn: "Libraries, archives and museums", parent: "91" },
  { code: "920", labelFi: "Rahapeli- ja vedonlyönti (3-nro)", labelEn: "Gambling (group)", parent: "92" },
  { code: "931", labelFi: "Urheilutoiminta", labelEn: "Sports activities", parent: "93" },
  { code: "932", labelFi: "Muu huvi- ja virkistystoiminta", labelEn: "Other amusement and recreation", parent: "93" },
  { code: "941", labelFi: "Elinkeinoelämän järjestöt", labelEn: "Business and employer organisations", parent: "94" },
  { code: "942", labelFi: "Ammattiyhdistykset", labelEn: "Trade unions", parent: "94" },
  { code: "949", labelFi: "Muut järjestöt", labelEn: "Other membership organisations", parent: "94" },
  { code: "951", labelFi: "Tietokoneiden korjaus", labelEn: "Repair of computers and communication equipment", parent: "95" },
  { code: "952", labelFi: "Kodin ja henkilökohtaisten tavaroiden korjaus", labelEn: "Repair of personal and household goods", parent: "95" },
  { code: "960", labelFi: "Muu henkilökohtainen palvelutoiminta (3-nro)", labelEn: "Other personal service (group)", parent: "96" },
];

export const LEGAL_FORMS = [
  { code: "OY", ytj: "OY", labelFi: "Osakeyhtiö", labelEn: "Limited company" },
  { code: "OYJ", ytj: "OYJ", labelFi: "Julkinen osakeyhtiö", labelEn: "Public limited company" },
  { code: "AY", ytj: "AY", labelFi: "Avoin yhtiö", labelEn: "General partnership" },
  { code: "KY", ytj: "KY", labelFi: "Kommandiittiyhtiö", labelEn: "Limited partnership" },
  { code: "TMI", ytj: "TMI", labelFi: "Toiminimi", labelEn: "Private trader" },
  { code: "OSK", ytj: "OK", labelFi: "Osuuskunta", labelEn: "Cooperative" },
  { code: "RY", ytj: "RY", labelFi: "Rekisteröity yhdistys", labelEn: "Registered association" },
  { code: "SAATIO", ytj: "SAATIO", labelFi: "Säätiö", labelEn: "Foundation" },
];

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function findMunicipality(q: string): Municipality | undefined {
  const n = q.trim().toLowerCase();
  return MUNICIPALITIES.find(
    (m) => m.name.toLowerCase() === n || m.nameSv?.toLowerCase() === n || m.code === q.trim(),
  );
}

export function municipalitiesWithin(fromName: string, km: number): Municipality[] {
  const origin = findMunicipality(fromName);
  if (!origin) return [];
  return MUNICIPALITIES.filter((m) => haversineKm(origin, m) <= km);
}

export const ALL_INDUSTRIES_CODE = "ALL";

export function isAllIndustries(codes: string[] | null | undefined): boolean {
  if (!codes?.length) return false;
  return codes.some((c) => String(c).trim().toUpperCase() === ALL_INDUSTRIES_CODE);
}

export function industryMatches(code: string | null | undefined, wanted: string[]): boolean {
  if (isAllIndustries(wanted)) return true;
  if (!code) return false;
  const a = code.replace(/\D/g, "");
  if (!a) return false;
  return wanted.some((w) => {
    const b = String(w).replace(/\D/g, "");
    if (!b || b.length < 2) return false;
    if (a === b) return true;
    if (a.startsWith(b)) return true;
    if (b.startsWith(a) && a.length >= 2) return true;
    return false;
  });
}

const DEAD_NAME = /konkurssipes|selvitystil|likvidaati|bankruptcy estate|in liquidation/i;

const LIVE_STATUS = new Set(["active", "restructuring", "situation_listed", "pending", "valid", "1", "2"]);
const DEAD_STATUS = new Set(["dissolved", "bankrupt", "liquidating", "ceased", "invalidated", "removed", "5", "4", "0"]);
const DEAD_TRADE_REGISTER = new Set(["0", "2", "3", "4"]);

export function isLiveBusinessStatus(status: string | number | null | undefined): boolean {
  const st = String(status ?? "").toLowerCase().trim();
  if (!st) return true;
  if (LIVE_STATUS.has(st)) return true;
  if (DEAD_STATUS.has(st)) return false;
  return true;
}

export function isInactiveCompany(c: {
  name?: string | null;
  endDate?: string | null;
  businessStatus?: string | null;
  tradeRegisterStatus?: string | null;
}): boolean {
  if (c.endDate) return true;
  if (DEAD_NAME.test(c.name ?? "")) return true;
  const tr = String(c.tradeRegisterStatus ?? "").trim();
  if (DEAD_TRADE_REGISTER.has(tr)) return true;
  const st = (c.businessStatus ?? "").toLowerCase().trim();
  if (!st) return false;
  if (LIVE_STATUS.has(st)) return false;
  if (DEAD_STATUS.has(st)) return true;
  return false;
}

/** Names that must not appear when hunting a different industry. */
const INDUSTRY_NAME_BLOCK: Array<{ when: RegExp; needle: RegExp }> = [
  { when: /^73/, needle: /asianajo|lakitoimist|asianajaja|\blaw firm\b|attorneys?\b|sähköasenn|sähköurak|psykiatr|hammaslääkär|lääkärikeskus|asunto-osakeyhtiö|^as\.?\s*oy\b/i },
  { when: /^62/, needle: /asianajo|lakitoimist|sähköasenn|psykiatr|^as\.?\s*oy\b/i },
  { when: /^41|^42|^43/, needle: /asianajo|lakitoimist|mainostoimist|psykiatr/i },
];

export function industryNameBlocked(name: string | null | undefined, wanted: string[]): boolean {
  if (!name || !wanted.length) return false;
  const codes = wanted.map((w) => String(w).replace(/\D/g, "")).filter(Boolean);
  return INDUSTRY_NAME_BLOCK.some((row) => codes.some((c) => row.when.test(c)) && row.needle.test(name));
}

type IndustryAlias = { codes: string[]; needle: RegExp };

const INDUSTRY_ALIASES: IndustryAlias[] = [
  { codes: ["73"], needle: /mainostoimist|markkinointi|\bmarketing\b|markkinatutkim|advertising agenc|ad agency|market research|media agency|digitoimist|digital marketing|digital agency/i },
  { codes: ["62"], needle: /ohjelmist|software\b|saas\b|it-yhti|tietotekniik|computer programming|it-konsult/i },
  { codes: ["43210", "43"], needle: /sähköasenn|sähköurak|sähköfir|electrical install|electrical contractor|teollisuussähkö/i },
  { codes: ["35"], needle: /sähköyhtiö|energiayhti|sähkönsiirto|electricity (?:company|utility)|power utility|kaukolämpö/i },
  { codes: ["86"], needle: /psykiatr|lääkärikeskus|hammaslääkär|terveysasem|healthcare|lääkäri|hoivakoti|terveyspalvel/i },
  { codes: ["43910"], needle: /kattourak|kateurak|kattourako|roofing contractor|\bkattamis/i },
  { codes: ["41"], needle: /rakenn|construct|hvac\b|lvi-|\blvi\b|kateurak|maanrakenn/i },
  { codes: ["25", "28", "33", "24", "27", "26", "10", "22", "23", "29", "16", "17", "20", "13", "31", "32"], needle: /valmistav(?:an|a)\s+teollisu|manufacturing industr|c-teollisu/i },
  { codes: ["10", "25", "28"], needle: /industrial compan(?:y|ies)|teollisuusyrity|teollisuusyhti|finnish industrial/i },
  { codes: ["26", "27", "28", "33"], needle: /automaatioratkais|teollisuusautomaatio|industrial automation|\bplc\b|\bscada\b/i },
  { codes: ["28"], needle: /teollisu|manufactur|konepaj|industrial\b/i },
  { codes: ["47"], needle: /verkkokaup|e-?commerce|vähittäiskaup|retail\b|shopify/i },
  { codes: ["46"], needle: /tukkukaup|wholesale/i },
  { codes: ["68"], needle: /kiinteistö(?:ala|sijoitus|yhti)|property (?:company|management)|real estate/i },
  { codes: ["49"], needle: /logistiik|kuljetus|freight|transport/i },
  { codes: ["56"], needle: /ravintola|hotelli|hospitality|majotus/i },
  { codes: ["70"], needle: /(?:johtamis|management|liikejohdon)\s*konsult|management consult|pääkonttor/i },
  { codes: ["69"], needle: /lakiasiain|asianajot|tilitoimist|accounting firm|law firm/i },
  { codes: ["71"], needle: /arkkitehti|insinööritoimist|engineering (?:office|firm)/i },
  { codes: ["81"], needle: /kiinteistöhuolto|siivous|property maintenance|maisemanhoito/i },
  { codes: ["45"], needle: /autokaup|autokorjaam|motor vehicle/i },
  { codes: ["10"], needle: /elintarvike|food manufactur/i },
  { codes: ["55"], needle: /\bhotelli\b|majotus|accommodation/i },
  { codes: ["85"], needle: /koulutus|oppilaitos|education/i },
  { codes: ["64"], needle: /pankki|rahoituspalvel|financial service/i },
  { codes: ["80"], needle: /turvallisuuspalvel|vartiointi|security (?:firm|service)/i },
  { codes: ["78"], needle: /henkilöstövuokraus|työllistämis|staffing|recruitment agency/i },
];

export function inferIndustryCodes(text: string): string[] {
  const t = text.trim();
  if (!t) return [];
  const out: string[] = [];
  const add = (code: string) => {
    const v = code.replace(/\D/g, "") || code;
    if (v && !out.includes(v)) out.push(v);
  };
  const marketing = /mainostoimist|markkinointi|\bmarketing\b|advertising agenc|ad agency|digital marketing|digital agency|digitoimist|market research/i.test(t);
  for (const row of INDUSTRY_ALIASES) {
    if (marketing && row.codes[0] === "70") continue;
    if (row.needle.test(t)) row.codes.forEach(add);
  }
  const lower = t.toLowerCase();
  for (const i of INDUSTRIES) {
    const fi = i.labelFi.toLowerCase();
    const en = i.labelEn.toLowerCase();
    if (fi.length >= 10 && lower.includes(fi)) add(i.code);
    if (en.length >= 10 && lower.includes(en)) add(i.code);
  }
  return out.slice(0, 12);
}

export function municipalityAliases(name: string): string[] {
  const n = name.trim().toLowerCase();
  if (!n) return [];
  const row = MUNICIPALITIES.find(
    (m) => m.name.toLowerCase() === n || (m.nameSv && m.nameSv.toLowerCase() === n) || m.code === name.trim(),
  );
  if (!row) return [n];
  return [row.name.toLowerCase(), (row.nameSv ?? "").toLowerCase()].filter(Boolean);
}

export function municipalitiesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const left = municipalityAliases(a);
  const right = municipalityAliases(b);
  return left.some((x) => right.some((y) => x === y || x.includes(y) || y.includes(x)));
}

export function industryLabel(code: string): string | undefined {
  const row = INDUSTRIES.find((i) => i.code === code);
  return row ? row.labelFi : undefined;
}

const HOUSING_NAME = /^(as\.?\s*oy\b|asunto-osakeyhtiö|as oy\b|kiinteistö\s+oy\b|kiinteistöosakeyhtiö)/i;

export function isHousingCompany(c: {
  name?: string | null;
  legalForm?: string | null;
  legalFormCode?: string | null;
  industryCode?: string | null;
  industryLabel?: string | null;
}): boolean {
  if (HOUSING_NAME.test((c.name ?? "").trim())) return true;
  const form = `${c.legalForm ?? ""} ${c.legalFormCode ?? ""}`.toLowerCase();
  if (/\baoy\b|\bkoy\b|asunto-osakeyhtiö|bostadsaktiebolag|housing corporation|housing company|kiinteistöosakeyhtiö/.test(form)) return true;
  if (c.legalFormCode === "2" || c.legalFormCode === "10") return true;
  const code = (c.industryCode ?? "").replace(/\D/g, "");
  if (code.startsWith("682")) return true;
  const label = (c.industryLabel ?? "").toLowerCase();
  if (/asuntojen ja asuinkiinteistöjen hallinta|operating of own or leased dwellings/.test(label)) return true;
  return false;
}

export function wantsHousingIndustry(codes: string[]): boolean {
  return codes.some((c) => String(c).replace(/\D/g, "").startsWith("68"));
}

/** TOL 2008 5-digit codes Statistics Finland replaced in TOIMI4 (2026-01-01). Query the live successor first. */
export const TOL_SUCCESSORS: Record<string, string[]> = {
  "62010": ["62100"],
  "62020": ["62200"],
  "62030": ["62200"],
  "62090": ["62900"],
  "63110": ["63100"],
  "63120": ["63100"],
  "63910": ["63900"],
  "63990": ["63900"],
  "70220": ["70200"],
};

/** YTJ treats mainBusinessLine as a substring. Prefer live TOIMI4 children; keep 2-digit only when no children exist. */
export function expandIndustryQueryCodes(codes: string[]): string[] {
  const out: string[] = [];
  const add = (v: string) => {
    const n = String(v).replace(/\D/g, "");
    if (!n || out.includes(n)) return;
    out.push(n);
  };
  for (const raw of codes) {
    const v = String(raw).replace(/\D/g, "");
    if (!v || String(raw).toUpperCase() === ALL_INDUSTRIES_CODE) continue;
    if (v.length >= 4) {
      for (const s of TOL_SUCCESSORS[v] ?? []) add(s);
      add(v);
      continue;
    }
    const kids = INDUSTRIES.filter((i) => i.code.length >= 4 && (i.parent === v || i.code.startsWith(v)));
    if (kids.length) {
      kids
        .slice()
        .sort((a, b) => Number(Boolean(TOL_SUCCESSORS[a.code])) - Number(Boolean(TOL_SUCCESSORS[b.code])))
        .forEach((k) => add(k.code));
    } else add(v);
  }
  return out;
}

export const INDUSTRY_GROUPS: Array<{ id: string; label: string; codes: string[] }> = [
  { id: "all", label: "Kaikki toimialat", codes: [ALL_INDUSTRIES_CODE] },
  { id: "marketing", label: "Marketing and advertising", codes: ["73"] },
  { id: "it", label: "Software and IT", codes: ["62", "63"] },
  { id: "construction", label: "Construction", codes: ["41", "42", "43"] },
  { id: "manufacturing", label: "Manufacturing", codes: ["10", "25", "28"] },
  { id: "wholesale", label: "Wholesale and trade", codes: ["46", "45"] },
  { id: "retail", label: "Retail", codes: ["47"] },
  { id: "professional", label: "Consulting and professional services", codes: ["69", "70", "71", "74"] },
  { id: "health", label: "Healthcare", codes: ["86"] },
  { id: "logistics", label: "Transport and logistics", codes: ["49", "52"] },
  { id: "hospitality", label: "Hotels and restaurants", codes: ["55", "56"] },
  { id: "energy", label: "Energy and utilities", codes: ["35"] },
  { id: "finance", label: "Finance and insurance", codes: ["64", "65"] },
  { id: "education", label: "Education", codes: ["85"] },
  { id: "public", label: "Public sector", codes: ["84"] },
];

export type CustomerType = "b2b" | "b2c" | "b2g";

export const CUSTOMER_TYPE_CODES: Record<CustomerType, string[]> = {
  b2b: ["10", "25", "28", "33", "41", "42", "43", "46", "49", "52", "62", "63", "69", "70", "71", "72", "73", "74", "78", "80", "82"],
  b2c: ["45", "47", "55", "56", "79", "85", "86", "93", "95", "96"],
  b2g: ["84"],
};

export function groupForIndustryCodes(codes: string[]): string {
  const n = codes.map((c) => String(c).replace(/\D/g, "")).filter(Boolean);
  if (isAllIndustries(codes) || !codes.filter((c) => String(c).trim()).length) return "all";
  if (!n.length) return "all";
  const hit = INDUSTRY_GROUPS.find((g) =>
    n.every((x) => g.codes.some((gc) => x === gc || x.startsWith(gc))) &&
    g.codes.some((gc) => n.some((x) => x === gc || x.startsWith(gc))),
  );
  return hit?.id ?? "";
}




/** Normalised municipality, Swedish name and region tokens for branch-name stripping. */
export function placeNameSet(): Set<string> {
  const out = new Set<string>();
  for (const m of MUNICIPALITIES) {
    out.add(normalizeName(m.name));
    if (m.nameSv) out.add(normalizeName(m.nameSv));
    out.add(normalizeName(m.region));
  }
  for (const extra of [
    "suomi", "finland", "ahvenanmaa", "lappi", "lapland",
    "paijat-hame", "kanta-hame", "etela-savo", "pohjois-savo",
    "etela-karjala", "pohjois-karjala", "keski-suomi",
  ]) {
    out.add(extra);
  }
  return out;
}

