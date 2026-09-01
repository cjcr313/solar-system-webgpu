/**
 * ============================================================================
 *  celestialData.ts — Base de datos astronómica del Sistema Solar
 * ============================================================================
 *  Datos físicos, orbitales (elementos keplerianos J2000.0, aprox. Standish/JPL),
 *  atmosféricos, de estructura interna y de exploración para:
 *  - El Sol
 *  - 8 planetas + Plutón (planeta enano)
 *  - 9 lunas principales (Luna, galileanas, Titán, Encélado, Mimas)
 *  - 4 asteroides destacados (Ceres, Vesta, Palas, Higia)
 *
 *  Fuentes: tablas de elementos orbitales JPL (época J2000), NASA Planetary
 *  Fact Sheets, NASA Solar System Exploration, resultados de misiones
 *  (Cassini, Dawn, Galileo, Juno, InSight, New Horizons, Voyager).
 */

export type BodyType = 'star' | 'planet' | 'dwarf-planet' | 'moon' | 'asteroid';

export interface LayerInfo {
  name: string;
  /** Porcentaje (aprox. de masa o de radio, según la mejor estimación pública) */
  pct: number;
  color: string;
  note: string;
}

export interface GasInfo {
  gas: string;
  pct: number;
}

export interface MissionInfo {
  name: string;
  agency: string;
  year: string;
  highlight: string;
}

export interface AtmosphereInfo {
  composition: GasInfo[];
  /** Presión superficial (texto formateado) */
  pressure?: string;
  /** Presión en bar (para comparaciones) */
  pressureBar?: number;
  tempMean?: string;
  tempRange?: string;
  winds?: string;
  notes?: string;
}

export interface OrbitalElementsData {
  a: number; // UA
  e: number;
  iDeg: number;
  OmegaDeg: number;
  omegaDeg: number;
  M0Deg: number;
  periodDays: number;
}

export interface MoonOrbitData {
  parentId: string;
  radiusKm: number;
  periodDays: number;
  e: number;
  iDeg: number;
}

export interface PhysicalInfo {
  massKg: string;
  densityGcm3: number;
  gravityMs2: number;
  escapeKms: number;
  meanTempC?: string;
}

export interface CelestialBody {
  id: string;
  name: string;
  type: BodyType;
  /** Color base para órbita / HUD / marcadores */
  color: number;
  textureKind:
    | 'sun'
    | 'mercury'
    | 'venus'
    | 'earth'
    | 'moon'
    | 'mars'
    | 'jupiter'
    | 'saturn'
    | 'uranus'
    | 'neptune'
    | 'pluto'
    | 'ice'
    | 'rock';
  radiusKm: number;
  axialTiltDeg: number;
  /** Horas por rotación (negativo = retrógrada) */
  rotationHours: number;
  /** Órbita heliocéntrica (planetas / asteroides) */
  orbital?: OrbitalElementsData;
  /** Órbita local alrededor del padre (lunas) */
  moonOf?: MoonOrbitData;
  rings?: { innerKm: number; outerKm: number };
  atmosphereColor?: number;
  atmosphereIntensity?: number;
  physical: PhysicalInfo;
  structure: LayerInfo[];
  atmosphere: AtmosphereInfo;
  missions: MissionInfo[];
  summary: string;
}

/* ---------------------------------------------------------------------------
 * SOL
 * ------------------------------------------------------------------------ */
export const SUN: CelestialBody = {
  id: 'sun',
  name: 'Sol',
  type: 'star',
  color: 0xffc857,
  textureKind: 'sun',
  radiusKm: 696340,
  axialTiltDeg: 7.25,
  rotationHours: 609.12,
  physical: {
    massKg: '1,989 × 10³⁰ kg',
    densityGcm3: 1.41,
    gravityMs2: 274,
    escapeKms: 617.6,
    meanTempC: '5 505 °C (fotosfera) · 15 M °C (núcleo)'
  },
  structure: [
    { name: 'Núcleo (fusión)', pct: 34, color: '#fff7d6', note: 'Fusión H→He a 15,7 M K; produce toda la energía solar.' },
    { name: 'Zona radiativa', pct: 48, color: '#ffd166', note: 'La energía tarda ~170 000 años en cruzarla por radiación.' },
    { name: 'Zona convectiva', pct: 17, color: '#ff9f43', note: 'Plasma asciende en celdas convectivas (~30 % del radio externo).' },
    { name: 'Fotosfera / cromosfera', pct: 1, color: '#ff6b35', note: 'Superficie visible (~5 500 °C) y capa rosada de 2 500 km.' }
  ],
  atmosphere: {
    composition: [
      { gas: 'Hidrógeno (H)', pct: 73.46 },
      { gas: 'Helio (He)', pct: 24.85 },
      { gas: 'Oxígeno (O)', pct: 0.77 },
      { gas: 'Carbono (C)', pct: 0.29 }
    ],
    pressure: '—',
    tempMean: '5 505 °C',
    tempRange: '−2 730 a 15 000 000 °C',
    winds: 'Viento solar: 400–800 km/s',
    notes: 'Corona a 1–3 M K; ciclo de actividad magnética de ~11 años.'
  },
  missions: [
    { name: 'SOHO', agency: 'ESA/NASA', year: '1995–', highlight: 'Observatorio solar permanente; alertas de CME.' },
    { name: 'Ulysses', agency: 'ESA/NASA', year: '1990–2009', highlight: 'Primer estudio de los polos solares.' },
    { name: 'Parker Solar Probe', agency: 'NASA', year: '2018–', highlight: 'Tocó la corona (2021); récord de velocidad humana (692 000 km/h).' },
    { name: 'Solar Orbiter', agency: 'ESA', year: '2020–', highlight: 'Primeras imágenes de alta resolución de los polos solares.' }
  ],
  summary:
    'La estrella central: contiene el 99,86 % de la masa del Sistema Solar. Una esfera de plasma que convierte 600 M de toneladas de hidrógeno en helio por segundo.'
};

/* ---------------------------------------------------------------------------
 * PLANETAS (elementos keplerianos J2000, aprox. Standish)
 * ------------------------------------------------------------------------ */
export const MERCURY: CelestialBody = {
  id: 'mercury',
  name: 'Mercurio',
  type: 'planet',
  color: 0x9aa0a6,
  textureKind: 'mercury',
  radiusKm: 2439.7,
  axialTiltDeg: 0.034,
  rotationHours: 1407.6,
  orbital: { a: 0.38710, e: 0.20563, iDeg: 7.005, OmegaDeg: 48.331, omegaDeg: 29.125, M0Deg: 174.795, periodDays: 87.969 },
  physical: { massKg: '3,301 × 10²³ kg', densityGcm3: 5.43, gravityMs2: 3.7, escapeKms: 4.25, meanTempC: '167 °C' },
  structure: [
    { name: 'Núcleo Fe-Ni', pct: 62, color: '#b08968', note: 'Desproporcionadamente grande: ~85 % del radio del planeta.' },
    { name: 'Manto de silicatos', pct: 36, color: '#7f5539', note: 'Delgado; el planeta es casi un núcleo desnudo.' },
    { name: 'Corteza', pct: 2, color: '#5c4742', note: 'Craterizada, de 35–50 km; escarpes de contracción térmica.' }
  ],
  atmosphere: {
    composition: [
      { gas: 'Oxígeno (O₂)', pct: 42 },
      { gas: 'Sodio (Na)', pct: 29 },
      { gas: 'Hidrógeno (H₂)', pct: 22 },
      { gas: 'Helio (He)', pct: 6 }
    ],
    pressure: '< 10⁻¹⁴ bar (exosfera)',
    pressureBar: 1e-14,
    tempMean: '167 °C',
    tempRange: '−173 a 427 °C',
    winds: '—',
    notes: 'La mayor oscilación térmica del Sistema Solar: ¡600 °C entre día y noche!'
  },
  missions: [
    { name: 'Mariner 10', agency: 'NASA', year: '1974–75', highlight: 'Primer sobrevuelo; 45 % del mapeo superficial.' },
    { name: 'MESSENGER', agency: 'NASA', year: '2011–15', highlight: 'Primer orbitador; halló hielo de agua en cráteres polares.' },
    { name: 'BepiColombo', agency: 'ESA/JAXA', year: '2018–', highlight: 'Dos orbitadores; inserción orbital prevista para 2026.' }
  ],
  summary:
    'El planeta más pequeño y veloz: completa su órbita en solo 88 días. Sin atmósfera real, su superficie craterizada oscila entre el horno y el congelador.'
};

export const VENUS: CelestialBody = {
  id: 'venus',
  name: 'Venus',
  type: 'planet',
  color: 0xe8c468,
  textureKind: 'venus',
  radiusKm: 6051.8,
  axialTiltDeg: 177.36,
  rotationHours: -5832.5,
  orbital: { a: 0.72333, e: 0.00677, iDeg: 3.395, OmegaDeg: 76.680, omegaDeg: 54.884, M0Deg: 50.416, periodDays: 224.701 },
  atmosphereColor: 0xf5d9a0,
  atmosphereIntensity: 1.2,
  physical: { massKg: '4,867 × 10²⁴ kg', densityGcm3: 5.24, gravityMs2: 8.87, escapeKms: 10.36, meanTempC: '464 °C' },
  structure: [
    { name: 'Núcleo Fe-Ni', pct: 30, color: '#e0a458', note: 'Probablemente parcialmente líquido; sin dinamo detectable.' },
    { name: 'Manto rocoso', pct: 68, color: '#b07d3a', note: 'Actividad volcánica probablemente activa (resurgimiento coronas).' },
    { name: 'Corteza basáltica', pct: 2, color: '#8a5a2b', note: '~50 km; rejuvenecida por vulcanismo masivo.' }
  ],
  atmosphere: {
    composition: [
      { gas: 'Dióxido de carbono (CO₂)', pct: 96.5 },
      { gas: 'Nitrógeno (N₂)', pct: 3.5 }
    ],
    pressure: '92 bar',
    pressureBar: 92,
    tempMean: '464 °C',
    tempRange: '≈ 464 °C (isotérmico, día y noche)',
    winds: 'Superrotación: 360 km/h (capa superior)',
    notes: 'Efecto invernadero desbocado: la presión superficial equivale a 900 m bajo el mar. Llueve ácido sulfúrico que se evapora antes de tocar suelo.'
  },
  missions: [
    { name: 'Venera 7', agency: 'URSS', year: '1970', highlight: 'Primer aterrizaje exitoto en otro planeta.' },
    { name: 'Magellan', agency: 'NASA', year: '1990–94', highlight: 'Radar que mapeó el 98 % de la superficie.' },
    { name: 'Venus Express', agency: 'ESA', year: '2006–14', highlight: 'Estudió la superrotación atmosférica y el viento solar.' },
    { name: 'Akatsuki', agency: 'JAXA', year: '2015–', highlight: 'Detectó ondas gravitacionales gigantes en la atmósfera.' }
  ],
  summary:
    'El gemelo infernal de la Tierra: un invernadero fuera de control a 464 °C constantes. Gira al revés y tan lento que su día dura más que su año.'
};

export const EARTH: CelestialBody = {
  id: 'earth',
  name: 'Tierra',
  type: 'planet',
  color: 0x4d94ff,
  textureKind: 'earth',
  radiusKm: 6371,
  axialTiltDeg: 23.44,
  rotationHours: 23.934,
  orbital: { a: 1.00000, e: 0.01671, iDeg: 0.0, OmegaDeg: 0.0, omegaDeg: 102.947, M0Deg: 357.517, periodDays: 365.256 },
  atmosphereColor: 0x6ab7ff,
  atmosphereIntensity: 1.35,
  physical: { massKg: '5,972 × 10²⁴ kg', densityGcm3: 5.51, gravityMs2: 9.81, escapeKms: 11.19, meanTempC: '15 °C' },
  structure: [
    { name: 'Núcleo interno (sólido)', pct: 1.7, color: '#ffe066', note: 'Hierro-níquel sólido a ~5 400 °C, del tamaño de la Luna.' },
    { name: 'Núcleo externo (líquido)', pct: 30.8, color: '#ff9f43', note: 'Hierro líquido en convección: genera el campo magnético.' },
    { name: 'Manto', pct: 67, color: '#c06c3f', note: 'Roca de silicatos en convección lenta; motor de las placas tectónicas.' },
    { name: 'Corteza', pct: 0.4, color: '#8a5a3a', note: 'La única corteza conocida con placas móviles.' },
    { name: 'Océanos', pct: 0.02, color: '#2d6a9f', note: '71 % de la superficie; el agua líquida define al planeta.' }
  ],
  atmosphere: {
    composition: [
      { gas: 'Nitrógeno (N₂)', pct: 78.08 },
      { gas: 'Oxígeno (O₂)', pct: 20.95 },
      { gas: 'Argón (Ar)', pct: 0.93 },
      { gas: 'CO₂ + otros', pct: 0.04 }
    ],
    pressure: '1,013 bar',
    pressureBar: 1.013,
    tempMean: '15 °C',
    tempRange: '−89,2 a 56,7 °C',
    winds: '10–100 km/h (jets: ~400 km/h)',
    notes: 'El único mundo conocido con vida, océanos estables y una capa de ozono que filtra la radiación UV.'
  },
  missions: [
    { name: 'Sputnik 1', agency: 'URSS', year: '1957', highlight: 'Primer satélite artificial; nace la era espacial.' },
    { name: 'Apollo 11', agency: 'NASA', year: '1969', highlight: 'Primer humano en otro mundo (la Luna).' },
    { name: 'ISS', agency: 'Internacional', year: '2000–', highlight: 'Laboratorio habitado permanente en órbita baja.' }
  ],
  summary:
    'Nuestro hogar: el único lugar del universo confirmado con vida. Un planeta rocoso con océanos líquidos, tectónica activa y un escudo magnético que nos protege del viento solar.'
};

export const MARS: CelestialBody = {
  id: 'mars',
  name: 'Marte',
  type: 'planet',
  color: 0xd97b4a,
  textureKind: 'mars',
  radiusKm: 3389.5,
  axialTiltDeg: 25.19,
  rotationHours: 24.623,
  orbital: { a: 1.52368, e: 0.09340, iDeg: 1.850, OmegaDeg: 49.558, omegaDeg: 286.483, M0Deg: 19.412, periodDays: 686.980 },
  atmosphereColor: 0xd8a27a,
  atmosphereIntensity: 0.55,
  physical: { massKg: '6,417 × 10²³ kg', densityGcm3: 3.93, gravityMs2: 3.71, escapeKms: 5.03, meanTempC: '−63 °C' },
  structure: [
    { name: 'Núcleo Fe-S líquido', pct: 25, color: '#e07b39', note: 'Radio ~1 830 km (InSight); líquido, pero sin dinamo global.' },
    { name: 'Manto de silicatos', pct: 70, color: '#a3542f', note: 'Inactivo desde hace ~4 Ga: sin placas tectónicas.' },
    { name: 'Corteza basáltica', pct: 5, color: '#773c22', note: '24–72 km; el mayor volcán del Sistema Solar la corona.' }
  ],
  atmosphere: {
    composition: [
      { gas: 'Dióxido de carbono (CO₂)', pct: 95.3 },
      { gas: 'Nitrógeno (N₂)', pct: 2.7 },
      { gas: 'Argón (Ar)', pct: 1.6 },
      { gas: 'Oxígeno (O₂)', pct: 0.13 }
    ],
    pressure: '0,0063 bar',
    pressureBar: 0.0063,
    tempMean: '−63 °C',
    tempRange: '−143 a 35 °C',
    winds: '10–30 km/s/h → hasta 400 km/h en tormentas globales de polvo',
    notes: 'Atmósfera 100 veces más tenue que la terrestre. Casquetes polares de CO₂ y H₂O; el monte Olimpo mide 22 km de altura.'
  },
  missions: [
    { name: 'Viking 1 y 2', agency: 'NASA', year: '1976', highlight: 'Primeros aterrizajes exitosos y búsqueda de vida.' },
    { name: 'Spirit / Opportunity', agency: 'NASA', year: '2004–18', highlight: 'Rovers que hallaron evidencia de agua antigua (Opportunity: 45 km recorridos).' },
    { name: 'Curiosity', agency: 'NASA', year: '2012–', highlight: 'Confirmó que Gale fue un lago habitable con química orgánica.' },
    { name: 'Perseverance + Ingenuity', agency: 'NASA', year: '2021–', highlight: 'Muestreo para retorno a la Tierra; primer vuelo propulsado en otro planeta.' },
    { name: 'InSight', agency: 'NASA', year: '2018–22', highlight: 'Sismómetro que reveló el núcleo líquido marciano.' }
  ],
  summary:
    'El planeta rojo: un desierto helado con el volcán y el cañón más grandes del Sistema Solar. Hubo ríos y lagos; hoy es el mundo más explorado después del nuestro.'
};

export const JUPITER: CelestialBody = {
  id: 'jupiter',
  name: 'Júpiter',
  type: 'planet',
  color: 0xd8a56c,
  textureKind: 'jupiter',
  radiusKm: 69911,
  axialTiltDeg: 3.13,
  rotationHours: 9.925,
  orbital: { a: 5.20260, e: 0.04849, iDeg: 1.303, OmegaDeg: 100.464, omegaDeg: 273.867, M0Deg: 20.020, periodDays: 4332.589 },
  physical: { massKg: '1,898 × 10²⁷ kg', densityGcm3: 1.33, gravityMs2: 24.79, escapeKms: 59.5, meanTempC: '−108 °C (nivel 1 bar)' },
  structure: [
    { name: 'Núcleo difuso (roca/hielo)', pct: 4, color: '#c9956b', note: '“Diluido”: 10–20 M⊕ disueltas, sin superficie nítida.' },
    { name: 'Hidrógeno metálico líquido', pct: 76, color: '#a06b3f', note: 'Conductor: genera un campo magnético 20 000 veces el terrestre.' },
    { name: 'Envoltura H₂/He molecular', pct: 20, color: '#d8b98a', note: 'Nubes de amoníaco en bandas chorradas por vientos de 600 km/h.' }
  ],
  atmosphere: {
    composition: [
      { gas: 'Hidrógeno (H₂)', pct: 89.8 },
      { gas: 'Helio (He)', pct: 10.2 },
      { gas: 'Metano (CH₄) + otros', pct: 0.3 }
    ],
    pressure: '> 1 000 bar en profundidad',
    tempMean: '−108 °C',
    tempRange: '−145 °C (nubes) a ~20 000 °C (núcleo)',
    winds: '100–150 km/h; jets de hasta 600 km/h',
    notes: 'La Gran Mancha Roja: un anticiclón mayor que la Tierra activo desde hace al menos 350 años.'
  },
  missions: [
    { name: 'Pioneer 10 / 11', agency: 'NASA', year: '1973–74', highlight: 'Primeros sobrevuelos de Júpiter.' },
    { name: 'Voyager 1 / 2', agency: 'NASA', year: '1979', highlight: 'Descubrieron los anillos y el vulcanismo de Ío.' },
    { name: 'Galileo', agency: 'NASA', year: '1995–2003', highlight: 'Primer orbitador; sonda dentro de la atmósfera; océano de Europa.' },
    { name: 'Juno', agency: 'NASA', year: '2016–', highlight: 'Reveló la estructura interna y los ciclotes polares geométricos.' },
    { name: 'Europa Clipper / JUICE', agency: 'NASA / ESA', year: '2023–30', highlight: 'Misiones en camino a las lunas oceánicas.' }
  ],
  summary:
    'El gigante que gobierna el sistema: 2,5 veces la masa de todos los demás planetas juntos. Un mundo de tormentas sin superficie donde cabrían 1 300 Tierras.'
};

export const SATURN: CelestialBody = {
  id: 'saturn',
  name: 'Saturno',
  type: 'planet',
  color: 0xe3cf9a,
  textureKind: 'saturn',
  radiusKm: 58232,
  axialTiltDeg: 26.73,
  rotationHours: 10.656,
  orbital: { a: 9.55491, e: 0.05551, iDeg: 2.489, OmegaDeg: 113.666, omegaDeg: 339.391, M0Deg: 317.020, periodDays: 10759.22 },
  rings: { innerKm: 74500, outerKm: 140220 },
  physical: { massKg: '5,683 × 10²⁶ kg', densityGcm3: 0.687, gravityMs2: 10.44, escapeKms: 35.5, meanTempC: '−139 °C' },
  structure: [
    { name: 'Núcleo roca/hielo', pct: 15, color: '#c9a26b', note: 'Más masivo que el de Júpiter en proporción.' },
    { name: 'Hidrógeno metálico', pct: 30, color: '#9a7b4f', note: 'Capa menor que la joviana; campo magnético ~578 × terrestre.' },
    { name: 'Envoltura H₂/He', pct: 55, color: '#e0cda4', note: 'El gas menos denso de todos los planetas: flotaría en agua.' }
  ],
  atmosphere: {
    composition: [
      { gas: 'Hidrógeno (H₂)', pct: 96.3 },
      { gas: 'Helio (He)', pct: 3.25 },
      { gas: 'Metano (CH₄)', pct: 0.45 }
    ],
    pressure: '> 1 000 bar en profundidad',
    tempMean: '−139 °C',
    tempRange: '−178 °C a ~11 700 °C (núcleo)',
    winds: '1 800 km/h en el ecuador',
    notes: 'Densidad media 0,687 g/cm³: el único planeta menos denso que el agua. Sus anillos son 99,9 % hielo de agua puro.'
  },
  missions: [
    { name: 'Pioneer 11', agency: 'NASA', year: '1979', highlight: 'Primer sobrevuelo; cruzó el plano de los anillos.' },
    { name: 'Voyager 1 / 2', agency: 'NASA', year: '1980–81', highlight: 'Detalle de los anillos y descubrimiento de “rayos” spoke.' },
    { name: 'Cassini-Huygens', agency: 'NASA/ESA/ASI', year: '2004–17', highlight: '13 años en órbita; aterrizaje en Titán; plumas de Encélado; inmersión final en Saturno.' }
  ],
  summary:
    'El señor de los anillos: un gigante dorado coronado por el espectáculo más grande del Sistema Solar, un disco de hielo de 280 000 km de ancho y solo ~10 m de grosor.'
};

export const URANUS: CelestialBody = {
  id: 'uranus',
  name: 'Urano',
  type: 'planet',
  color: 0x8fd1d8,
  textureKind: 'uranus',
  radiusKm: 25362,
  axialTiltDeg: 97.77,
  rotationHours: -17.24,
  orbital: { a: 19.21845, e: 0.04630, iDeg: 0.773, OmegaDeg: 74.006, omegaDeg: 98.999, M0Deg: 141.050, periodDays: 30688.5 },
  rings: { innerKm: 38000, outerKm: 51150 },
  physical: { massKg: '8,681 × 10²⁵ kg', densityGcm3: 1.27, gravityMs2: 8.87, escapeKms: 21.3, meanTempC: '−195 °C' },
  structure: [
    { name: 'Núcleo rocoso', pct: 20, color: '#7fb8c4', note: '~0,5 M⊕; pequeño para un gigante.' },
    { name: 'Manto de hielos (H₂O/NH₃/CH₄)', pct: 60, color: '#5d9bab', note: '“Océano” denso y caliente; fuente probable del campo magnético inclinado.' },
    { name: 'Envoltura H₂/He', pct: 20, color: '#a8dbe3', note: 'Fina y fría; el metano le da el color cian.' }
  ],
  atmosphere: {
    composition: [
      { gas: 'Hidrógeno (H₂)', pct: 82.5 },
      { gas: 'Helio (He)', pct: 15.2 },
      { gas: 'Metano (CH₄)', pct: 2.3 }
    ],
    pressure: '> 100 bar en profundidad',
    tempMean: '−195 °C',
    tempRange: '−224 a −160 °C',
    winds: '900 km/h (retrógrados, en el ecuador)',
    notes: 'El planeta más frío del Sistema Solar y el único que rueda “de lado”: su eje está volcado 98°. 13 anillos oscuros y 28 lunas con nombres shakespearianos.'
  },
  missions: [
    { name: 'Voyager 2', agency: 'NASA', year: '1986', highlight: 'Única visita: descubrió 10 lunas y 2 anillos nuevos.' },
    { name: 'JWST', agency: 'NASA/ESA/CSA', year: '2023–', highlight: 'Imágenes nítidas de sus anillos y tormentas polares.' },
    { name: 'Uranus Orbiter and Probe', agency: 'NASA (propuesta)', year: '~2035', highlight: 'Misión insignia prioritaria del Decadal Survey 2023–2032.' }
  ],
  summary:
    'El gigante volcado: un mundo cian que gira practically acostado, probablemente por un impacto colosal. Sus estaciones duran 21 años cada una.'
};

export const NEPTUNE: CelestialBody = {
  id: 'neptune',
  name: 'Neptuno',
  type: 'planet',
  color: 0x4f7bd9,
  textureKind: 'neptune',
  radiusKm: 24622,
  axialTiltDeg: 28.32,
  rotationHours: 16.11,
  orbital: { a: 30.11039, e: 0.00899, iDeg: 1.770, OmegaDeg: 131.784, omegaDeg: 276.340, M0Deg: 256.225, periodDays: 60182 },
  atmosphereColor: 0x5d8dee,
  atmosphereIntensity: 0.8,
  physical: { massKg: '1,024 × 10²⁶ kg', densityGcm3: 1.64, gravityMs2: 11.15, escapeKms: 23.5, meanTempC: '−201 °C' },
  structure: [
    { name: 'Núcleo rocoso', pct: 25, color: '#3d5fa8', note: '~1,1 M⊕, del tamaño de la Tierra.' },
    { name: 'Manto de hielos', pct: 60, color: '#2c4a8c', note: 'Agua, amoníaco y metano supercríticos a miles de K.' },
    { name: 'Envoltura H₂/He/CH₄', pct: 15, color: '#6d9aef', note: 'El metano absorbe el rojo: azul profundo.' }
  ],
  atmosphere: {
    composition: [
      { gas: 'Hidrógeno (H₂)', pct: 80 },
      { gas: 'Helio (He)', pct: 19 },
      { gas: 'Metano (CH₄)', pct: 1.5 }
    ],
    pressure: '> 100 bar en profundidad',
    tempMean: '−201 °C',
    tempRange: '−218 a −174 °C',
    winds: '2 100 km/h: los más rápidos del Sistema Solar',
    notes: 'Descubierto en 1846 “con lápiz y papel” (Le Verrier). Irradia 2,6× la energía que recibe del Sol.'
  },
  missions: [
    { name: 'Voyager 2', agency: 'NASA', year: '1989', highlight: 'Única visita; descubrió la Gran Mancha Oscura y Tritón activo.' },
    { name: 'JWST', agency: 'NASA/ESA/CSA', year: '2022–', highlight: 'Anillos nítidos y vórtices brillantes en el infrarrojo.' }
  ],
  summary:
    'El mundo de los vientos supersónicos: el planeta más lejano azota su atmósfera con rachas de 2 100 km/h. Un gigante azul descubierto por matemáticas antes que por telescopio.'
};

export const PLUTO: CelestialBody = {
  id: 'pluto',
  name: 'Plutón',
  type: 'dwarf-planet',
  color: 0xc9ab8f,
  textureKind: 'pluto',
  radiusKm: 1188.3,
  axialTiltDeg: 122.53,
  rotationHours: -153.29,
  orbital: { a: 39.48211, e: 0.24880, iDeg: 17.140, OmegaDeg: 110.299, omegaDeg: 113.769, M0Deg: 14.861, periodDays: 90560 },
  physical: { massKg: '1,303 × 10²² kg', densityGcm3: 1.85, gravityMs2: 0.62, escapeKms: 1.21, meanTempC: '−229 °C' },
  structure: [
    { name: 'Núcleo rocoso', pct: 65, color: '#a89078', note: 'Radio ~850 km; diferenciado.' },
    { name: 'Manto de hielo de agua', pct: 30, color: '#c9b8a3', note: 'Con posible océano líquido subsuperficial alimentado por radiactividad.' },
    { name: 'Corteza N₂/CH₄', pct: 5, color: '#e0d4c4', note: 'Glaciares de nitrógeno que “relanan” la superficie (Sputnik Planitia).' }
  ],
  atmosphere: {
    composition: [
      { gas: 'Nitrógeno (N₂)', pct: 90 },
      { gas: 'Metano (CH₄)', pct: 8 },
      { gas: 'Monóxido de carbono (CO)', pct: 2 }
    ],
    pressure: '10⁻⁵ bar',
    pressureBar: 1e-5,
    tempMean: '−229 °C',
    tempRange: '−233 a −223 °C',
    winds: '~10 m/s (en capa superficial)',
    notes: 'Atmósfera estacional: se congela y colapsa cuando se aleja del Sol. Comparte órbita resonante 2:3 con Neptuno.'
  },
  missions: [
    { name: 'New Horizons', agency: 'NASA', year: '2015', highlight: 'Sobrevuelo histórico: montañas de hielo, glaciar Sputnik Planitia y hazas azules.' },
    { name: 'Descubrimiento', agency: 'Lowell Obs.', year: '1930', highlight: 'Clyde Tombaugh; degradado a planeta enano en 2006.' }
  ],
  summary:
    'El corazón del cinturón de Kuiper: un mundo enano activo con glaciares de nitrógeno, montañas de hielo y quizás un océano escondido. Fue planeta durante 76 años.'
};

/* ---------------------------------------------------------------------------
 * LUNAS
 * ------------------------------------------------------------------------ */
export const MOON: CelestialBody = {
  id: 'moon',
  name: 'Luna',
  type: 'moon',
  color: 0xc9c9c9,
  textureKind: 'moon',
  radiusKm: 1737.4,
  axialTiltDeg: 6.68,
  rotationHours: 655.72,
  moonOf: { parentId: 'earth', radiusKm: 384400, periodDays: 27.322, e: 0.0549, iDeg: 5.145 },
  physical: { massKg: '7,342 × 10²² kg', densityGcm3: 3.34, gravityMs2: 1.62, escapeKms: 2.38, meanTempC: '−20 °C' },
  structure: [
    { name: 'Núcleo Fe pequeño', pct: 2, color: '#d4c5a9', note: 'Radio ~330 km; casi extinto magnéticamente.' },
    { name: 'Manto', pct: 68, color: '#a8a29a', note: 'Rígido; “lunarmotores” de marea los sacale ocasionalmente.' },
    { name: 'Corteza anortosítica', pct: 30, color: '#cfc9c1', note: 'Grosa 34–43 km: los “mares” son lava solidificada.' }
  ],
  atmosphere: {
    composition: [
      { gas: 'Helio / Ar / Na', pct: 100 }
    ],
    pressure: '≈ 3 × 10⁻¹⁵ bar (exosfera)',
    pressureBar: 3e-15,
    tempMean: '−20 °C',
    tempRange: '−173 a 127 °C',
    winds: '—',
    notes: 'Nacida de un impacto gigante contra la Tierra primitiva (Theia). Se aleja 3,8 cm/año; estabiliza el eje terrestre.'
  },
  missions: [
    { name: 'Luna 2', agency: 'URSS', year: '1959', highlight: 'Primer objeto humano en tocar otro mundo.' },
    { name: 'Apollo 11–17', agency: 'NASA', year: '1969–72', highlight: '12 humanos caminaron sobre ella; 382 kg de muestras.' },
    { name: 'Chang’e 4 / 5', agency: 'CNSA', year: '2019–20', highlight: 'Primer aterrizaje en la cara oculta; retorno de muestras jóvenes.' },
    { name: 'Artemis', agency: 'NASA', year: '2025–', highlight: 'Retorno humano planeado al polo sur lunar.' }
  ],
  summary:
    'Nuestra compañera única: la quinta luna más grande del Sistema Solar, nacida de un choque planetario. Sus mareas hicieron posible la vida compleja.'
};

export const IO: CelestialBody = {
  id: 'io',
  name: 'Ío',
  type: 'moon',
  color: 0xe8d06a,
  textureKind: 'rock',
  radiusKm: 1821.6,
  axialTiltDeg: 0,
  rotationHours: 42.46,
  moonOf: { parentId: 'jupiter', radiusKm: 421700, periodDays: 1.769, e: 0.0041, iDeg: 0.05 },
  physical: { massKg: '8,932 × 10²² kg', densityGcm3: 3.53, gravityMs2: 1.80, escapeKms: 2.56, meanTempC: '−143 °C (110 K)' },
  structure: [
    { name: 'Núcleo Fe-S', pct: 20, color: '#d9b44a', note: 'Radio ~520 km.' },
    { name: 'Manto de silicatos', pct: 75, color: '#b09a3f', note: 'Parcialmente fundido por marea.' },
    { name: 'Corteza volcánica', pct: 5, color: '#e8d06a', note: 'Reciclada sin descanso; sin cráteres de impacto visibles.' }
  ],
  atmosphere: {
    composition: [
      { gas: 'Dióxido de azufre (SO₂)', pct: 100 }
    ],
    pressure: '≈ 10⁻⁹ bar (variable)',
    pressureBar: 1e-9,
    tempMean: '−143 °C; puntos calientes: 1 600 °C',
    tempRange: '−163 °C a 1 600 °C',
    winds: 'Flujo de plasma (torus de Ío)',
    notes: 'El cuerpo más volcánico del Sistema Solar: 400+ volcanes activos alimentados por el amasado de marea de Júpiter.'
  },
  missions: [
    { name: 'Voyager 1', agency: 'NASA', year: '1979', highlight: 'Descubrimiento del vulcanismo activo: primera vez fuera de la Tierra.' },
    { name: 'Galileo', agency: 'NASA', year: '1995–2003', highlight: 'Monitoreó 100+ erupciones y montañas de 17 km.' },
    { name: 'Juno', agency: 'NASA', year: '2023–24', highlight: 'Sobrevuelos cercanos con imágennes del hemisferio sur.' }
  ],
  summary:
    'La luna de fuego: un mundo amarillo-azufre machacado por las mareas jovianas hasta fundirse. El objeto más volcánico que existe.'
};

export const EUROPA: CelestialBody = {
  id: 'europa',
  name: 'Europa',
  type: 'moon',
  color: 0xd8cfc0,
  textureKind: 'ice',
  radiusKm: 1560.8,
  axialTiltDeg: 0.1,
  rotationHours: 85.22,
  moonOf: { parentId: 'jupiter', radiusKm: 671034, periodDays: 3.551, e: 0.009, iDeg: 0.47 },
  physical: { massKg: '4,800 × 10²² kg', densityGcm3: 3.01, gravityMs2: 1.31, escapeKms: 2.02, meanTempC: '−160 °C' },
  structure: [
    { name: 'Núcleo metálico', pct: 10, color: '#c9b8a0', note: 'Radio ~600 km.' },
    { name: 'Manto rocoso', pct: 55, color: '#a89988', note: 'Silicatos; posible actividad hidrotermal.' },
    { name: 'Océano salado global', pct: 25, color: '#4d94d8', note: '60–150 km de profundidad: 2× el agua de todos los océanos terrestres.' },
    { name: 'Corteza de hielo', pct: 10, color: '#e8e0d4', note: '15–25 km; la superficie más lisa del Sistema Solar.' }
  ],
  atmosphere: {
    composition: [
      { gas: 'Oxígeno (O₂)', pct: 100 }
    ],
    pressure: '≈ 10⁻¹² bar',
    pressureBar: 1e-12,
    tempMean: '−160 °C',
    tempRange: '−220 a −150 °C',
    winds: '—',
    notes: 'El oxígeno viene de la radiación que rompe el hielo. El mejor candidato a albergar vida del Sistema Solar.'
  },
  missions: [
    { name: 'Galileo', agency: 'NASA', year: '1995–2003', highlight: 'Evidencia magnética del océano salado subsuperficial.' },
    { name: 'Hubble', agency: 'NASA/ESA', year: '2013–16', highlight: 'Posibles plumas de agua en el limbo sur.' },
    { name: 'Europa Clipper', agency: 'NASA', year: '2024–2030', highlight: '~50 sobrevuelos rasantes para caracterizar el océano y la habitabilidad.' },
    { name: 'JUICE', agency: 'ESA', year: '2023–', highlight: 'Incluye 2 sobrevuelos de Europa dentro de su gira joviana.' }
  ],
  summary:
    'La luna oceánica: bajo una corteza de hielo resquebrajado se esconde un mar salado global con el doble de agua que todos nuestros océanos. El principal candidato astrobiológico.'
};

export const GANYMEDE: CelestialBody = {
  id: 'ganymede',
  name: 'Ganímedes',
  type: 'moon',
  color: 0xa89f94,
  textureKind: 'moon',
  radiusKm: 2634.1,
  axialTiltDeg: 0.2,
  rotationHours: 171.71,
  moonOf: { parentId: 'jupiter', radiusKm: 1070412, periodDays: 7.155, e: 0.0013, iDeg: 0.2 },
  physical: { massKg: '1,482 × 10²³ kg', densityGcm3: 1.94, gravityMs2: 1.43, escapeKms: 2.74, meanTempC: '−163 °C' },
  structure: [
    { name: 'Núcleo metálico', pct: 10, color: '#b8a894', note: 'Genera la única magnetosfera lunar conocida.' },
    { name: 'Manto rocoso', pct: 45, color: '#948a7c', note: 'Con capa de hielo de alta presión.' },
    { name: 'Océano interno', pct: 10, color: '#4d94d8', note: 'Entre capas de hielo, detectado por Hubble (auroras).' },
    { name: 'Corteza de hielo', pct: 35, color: '#cfc4b4', note: 'Terreno oscuro antiguo + surcos claros tectónicos.' }
  ],
  atmosphere: {
    composition: [
      { gas: 'Oxígeno (O₂)', pct: 100 }
    ],
    pressure: '≈ 10⁻¹¹ bar',
    pressureBar: 1e-11,
    tempMean: '−163 °C',
    tempRange: '−203 a −121 °C',
    winds: '—',
    notes: 'La luna más grande del Sistema Solar: mayor que Mercurio. Única con campo magnético propio.'
  },
  missions: [
    { name: 'Galileo', agency: 'NASA', year: '1996–2000', highlight: 'Descubrió la magnetosfera y el océano subterráneo.' },
    { name: 'JUICE', agency: 'ESA', year: '2034 (prev.)', highlight: 'Será el primer orbitador de una luna joviana: Ganímedes.' }
  ],
  summary:
    'El gigante lunar: más grande que Mercurio y el único satélite con campo magnético propio. Otro mundo con océano escondido.'
};

export const CALLISTO: CelestialBody = {
  id: 'callisto',
  name: 'Calisto',
  type: 'moon',
  color: 0x8a7f72,
  textureKind: 'moon',
  radiusKm: 2410.3,
  axialTiltDeg: 0,
  rotationHours: 400.54,
  moonOf: { parentId: 'jupiter', radiusKm: 1882709, periodDays: 16.689, e: 0.0074, iDeg: 0.19 },
  physical: { massKg: '1,076 × 10²³ kg', densityGcm3: 1.83, gravityMs2: 1.24, escapeKms: 2.44, meanTempC: '−139 °C' },
  structure: [
    { name: 'Núcleo rocoso', pct: 50, color: '#8a7a68', note: 'Solo parcialmente diferenciado.' },
    { name: 'Manto hielo-roca', pct: 35, color: '#6f655a', note: 'Mezcla sin fundir: un “fósil” de la formación joviana.' },
    { name: 'Corteza de hielo', pct: 15, color: '#a89d8e', note: 'La superficie más craterizada del Sistema Solar: 4 Ga de historia.' }
  ],
  atmosphere: {
    composition: [
      { gas: 'CO₂ (trazas)', pct: 100 }
    ],
    pressure: '≈ 10⁻¹² bar',
    pressureBar: 1e-12,
    tempMean: '−139 °C',
    tempRange: '−193 a −108 °C',
    winds: '—',
    notes: 'Fuera del cinturón de radiación de Júpiter: base candidata para futuros humanos (radiación baja).'
  },
  missions: [
    { name: 'Voyager 1 / 2', agency: 'NASA', year: '1979', highlight: 'Primeras imágenes de su superficie saturada de cráteres.' },
    { name: 'Galileo', agency: 'NASA', year: '1995–2003', highlight: 'Posible océano profundo bajo 100+ km de hielo.' },
    { name: 'JUICE', agency: 'ESA', year: '2032 (prev.)', highlight: 'Múltiples sobrevuelos previos a orbitar Ganímedes.' }
  ],
  summary:
    'La luna fósil: la superficie más antigua y craterizada del Sistema Solar, sin cambiar en 4 000 millones de años. La candidata a base humana en Júpiter.'
};

export const TITAN: CelestialBody = {
  id: 'titan',
  name: 'Titán',
  type: 'moon',
  color: 0xd8a44c,
  textureKind: 'venus',
  radiusKm: 2574.7,
  axialTiltDeg: 0.3,
  rotationHours: 382.69,
  moonOf: { parentId: 'saturn', radiusKm: 1221870, periodDays: 15.945, e: 0.0288, iDeg: 0.35 },
  atmosphereColor: 0xe8b45c,
  atmosphereIntensity: 1.6,
  physical: { massKg: '1,345 × 10²³ kg', densityGcm3: 1.88, gravityMs2: 1.35, escapeKms: 2.64, meanTempC: '−179 °C' },
  structure: [
    { name: 'Núcleo rocoso', pct: 45, color: '#b8935a', note: '~1 800 km de radio.' },
    { name: 'Manto de hielo de agua', pct: 35, color: '#cfa763', note: 'Con capa de hielo de alta presión.' },
    { name: 'Océano subsuperficial', pct: 10, color: '#4d94d8', note: 'Agua + amoníaco, detectado por Cassini/Huygens.' },
    { name: 'Corteza de hielo + lagos', pct: 10, color: '#e8c06a', note: 'Lagos y mares de metano/etano líquidos: el único otro cuerpo con líquidos estables.' }
  ],
  atmosphere: {
    composition: [
      { gas: 'Nitrógeno (N₂)', pct: 94.2 },
      { gas: 'Metano (CH₄)', pct: 5.65 },
      { gas: 'Hidrógeno (H₂)', pct: 0.1 }
    ],
    pressure: '1,45 bar',
    pressureBar: 1.45,
    tempMean: '−179 °C',
    tempRange: '−179 °C (muy estable)',
    winds: 'Lluvia de metano; drenajes y ríos líquidos',
    notes: 'La única luna con atmósfera densa (1,5× la presión terrestre). Con ciclo de metano análogo al del agua en la Tierra. Huygens aterrizó ahí en 2005.'
  },
  missions: [
    { name: 'Voyager 1', agency: 'NASA', year: '1980', highlight: 'Reveló la bruma opaca de nitrógeno + metano.' },
    { name: 'Cassini', agency: 'NASA/ESA/ASI', year: '2004–17', highlight: 'Radar que mapeó lagos y mares de hidrocarburos.' },
    { name: 'Huygens', agency: 'ESA', year: '2005', highlight: 'Primer (y único) aterrizaje en una luna del sistema exterior.' },
    { name: 'Dragonfly', agency: 'NASA', year: '2028 (prev.)', highlight: 'Dron nuclear que volará entre dunas de Titán.' }
  ],
  summary:
    'La luna con atmósfera: un mundo de lagos de metano, dunas orgánicas y un ciclo “hidrológico” de hidrocarburos. El laboratorio prebiótico más fascinante del Sistema Solar.'
};

export const ENCELADUS: CelestialBody = {
  id: 'enceladus',
  name: 'Encélado',
  type: 'moon',
  color: 0xe8f2f5,
  textureKind: 'ice',
  radiusKm: 252.1,
  axialTiltDeg: 0,
  rotationHours: 32.89,
  moonOf: { parentId: 'saturn', radiusKm: 237948, periodDays: 1.370, e: 0.0047, iDeg: 0.02 },
  physical: { massKg: '1,08 × 10²⁰ kg', densityGcm3: 1.61, gravityMs2: 0.113, escapeKms: 0.24, meanTempC: '−198 °C' },
  structure: [
    { name: 'Núcleo rocoso', pct: 60, color: '#a8b8c4', note: 'Porouso, con posible actividad hidrotermal.' },
    { name: 'Océano global', pct: 20, color: '#4d94d8', note: 'Bajo todo el polo sur; agua salada con sílice y H₂ (¡comida para microbios!).' },
    { name: 'Corteza de hielo', pct: 20, color: '#f0f8fa', note: 'Solo 20–25 km; el albedo más alto del Sistema Solar.' }
  ],
  atmosphere: {
    composition: [
      { gas: 'Vapor de agua (plumas)', pct: 91 },
      { gas: 'N₂ / CO₂ / CH₄ / H₂', pct: 9 }
    ],
    pressure: '≈ 10⁻¹² bar (plumas del polo sur)',
    pressureBar: 1e-12,
    tempMean: '−198 °C',
    tempRange: '−201 a −116 °C (fracturas)',
    winds: 'Plumas que alimentan el anillo E',
    notes: 'Géiseres de agua salada que escapan al espacio y alimentan el anillo E de Saturno. Contiene moléculas orgánicas complejas.'
  },
  missions: [
    { name: 'Cassini', agency: 'NASA/ESA/ASI', year: '2005–15', highlight: 'Cruzó las plumas: sal, sílice, metano, H₂ y fosfato → océano habitable.' }
  ],
  summary:
    'La luna que escupe su océano: géiseres de agua salada brotan de su polo sur, alimentando un anillo entero de Saturno. El tamaño de España con un mar interior.'
};

export const MIMAS: CelestialBody = {
  id: 'mimas',
  name: 'Mimas',
  type: 'moon',
  color: 0xc4bcb2,
  textureKind: 'moon',
  radiusKm: 198.2,
  axialTiltDeg: 0,
  rotationHours: 22.6,
  moonOf: { parentId: 'saturn', radiusKm: 185539, periodDays: 0.942, e: 0.0196, iDeg: 1.57 },
  physical: { massKg: '3,75 × 10¹⁹ kg', densityGcm3: 1.15, gravityMs2: 0.064, escapeKms: 0.16, meanTempC: '−200 °C' },
  structure: [
    { name: 'Núcleo rocoso', pct: 25, color: '#a89f94', note: 'Pequeño y difuso.' },
    { name: 'Manto/corteza de hielo', pct: 75, color: '#d4ccc2', note: 'Grueso; posible océano joven detectado por libaciones (2024).' }
  ],
  atmosphere: {
    composition: [],
    pressure: 'Sin atmósfera',
    tempMean: '−200 °C',
    tempRange: '−200 °C aprox.',
    winds: '—',
    notes: 'El cráter Herschel (130 km) le da aspecto de “Estrella de la Muerte”. ¡Estaría de cumpleaños!'
  },
  missions: [
    { name: 'Voyager 1', agency: 'NASA', year: '1980', highlight: 'Primeras imágenes del cráter Herschel.' },
    { name: 'Cassini', agency: 'NASA/ESA/ASI', year: '2005–17', highlight: 'Mapeó la superficie; evidencia de océano subsuperficial joven.' }
  ],
  summary:
    'La “Estrella de la Muerte”: un pequeño mundo de hielo marcado por el cráter de impacto Herschel, con un posible océano reciente bajo la corteza.'
};

/* ---------------------------------------------------------------------------
 * ASTEROIDES DESTACADOS
 * ------------------------------------------------------------------------ */
export const CERES: CelestialBody = {
  id: 'ceres',
  name: 'Ceres',
  type: 'dwarf-planet',
  color: 0x9aa0a6,
  textureKind: 'rock',
  radiusKm: 469.7,
  axialTiltDeg: 4,
  rotationHours: 9.07,
  orbital: { a: 2.7675, e: 0.0756, iDeg: 10.594, OmegaDeg: 80.393, omegaDeg: 73.597, M0Deg: 95.989, periodDays: 1683.15 },
  physical: { massKg: '9,38 × 10²⁰ kg', densityGcm3: 2.16, gravityMs2: 0.28, escapeKms: 0.51, meanTempC: '−105 °C' },
  structure: [
    { name: 'Núcleo rocoso', pct: 65, color: '#8a7f72', note: 'Diferenciado.' },
    { name: 'Manto rico en hielo', pct: 30, color: '#a8b2ba', note: 'Agua + sales; posible relictto de océano salino.' },
    { name: 'Corteza', pct: 5, color: '#c4bcb2', note: 'Manchas brillantes de carbonato de sodio (criptovulcanismo).' }
  ],
  atmosphere: {
    composition: [
      { gas: 'Vapor de agua (trazas)', pct: 100 }
    ],
    pressure: 'Trazas episódicas',
    tempMean: '−105 °C',
    tempRange: '−105 °C aprox.',
    winds: '—',
    notes: 'El objeto más masivo del cinturón principal: 25 % de su masa total en un solo cuerpo.'
  },
  missions: [
    { name: 'Dawn', agency: 'NASA', year: '2015–18', highlight: 'Primer orbitador de un asteroide del cinturón; halló materia orgánica y manchas salinas.' },
    { name: 'Piazzi', agency: 'Descubrimiento', year: '1801', highlight: 'Primer asteroide descubierto; por eso “planeta enano”.' }
  ],
  summary:
    'La reina del cinturón: contiene un tercio de la masa del cinturón principal entero. Un mundo oceánico fósil con criptovulcanismo salino activo.'
};

export const VESTA: CelestialBody = {
  id: 'vesta',
  name: 'Vesta',
  type: 'asteroid',
  color: 0xb0a89a,
  textureKind: 'rock',
  radiusKm: 262.7,
  axialTiltDeg: 29,
  rotationHours: 5.342,
  orbital: { a: 2.3615, e: 0.0887, iDeg: 7.141, OmegaDeg: 103.81, omegaDeg: 151.2, M0Deg: 20.9, periodDays: 1325.75 },
  physical: { massKg: '2,59 × 10²⁰ kg', densityGcm3: 3.46, gravityMs2: 0.25, escapeKms: 0.36, meanTempC: '−108 °C' },
  structure: [
    { name: 'Núcleo Fe', pct: 20, color: '#b0936b', note: '¡Diferenciado!: es un “planeta embrionario”.' },
    { name: 'Manto/corteza basáltica', pct: 80, color: '#a8a094', note: 'Origen de los meteoritos HED que caen en la Tierra.' }
  ],
  atmosphere: {
    composition: [],
    pressure: 'Sin atmósfera',
    tempMean: '−108 °C',
    tempRange: '−124 a −88 °C',
    winds: '—',
    notes: 'El asteroide más brillante visto desde la Tierra. El cráter Rheasilvia (505 km) casi lo parte en dos.'
  },
  missions: [
    { name: 'Dawn', agency: 'NASA', year: '2011–12', highlight: 'Orbitó y mapeó Vesta antes de partir hacia Ceres.' },
    { name: 'Olbers', agency: 'Descubrimiento', year: '1807', highlight: 'Cuarto asteroide descubierto.' }
  ],
  summary:
    'El planeta embrionario: un protoplaneta diferenciado con núcleo de hierro. Sus esquirlas caen sobre la Tierra como meteoritos HED.'
};

export const PALLAS: CelestialBody = {
  id: 'pallas',
  name: 'Palas',
  type: 'asteroid',
  color: 0x8f9aa8,
  textureKind: 'rock',
  radiusKm: 256,
  axialTiltDeg: 84,
  rotationHours: 7.813,
  orbital: { a: 2.7729, e: 0.2302, iDeg: 34.836, OmegaDeg: 172.91, omegaDeg: 310.0, M0Deg: 40.6, periodDays: 1686.0 },
  physical: { massKg: '2,04 × 10²⁰ kg', densityGcm3: 2.9, gravityMs2: 0.2, escapeKms: 0.34, meanTempC: '−109 °C' },
  structure: [
    { name: 'Roca primitiva', pct: 100, color: '#9aa4ae', note: 'Cuerpo primitivo apenas diferenciado.' }
  ],
  atmosphere: { composition: [], pressure: 'Sin atmósfera', tempMean: '−109 °C', winds: '—', notes: 'Su órbita muy inclinada (34,8°) sugiere un origen violento por eyección.' },
  missions: [
    { name: 'Olbers', agency: 'Descubrimiento', year: '1802', highlight: 'Segundo asteroide descubierto.' }
  ],
  summary:
    'La bola de billar: el tercer objeto más masivo del cinturón, con la órbita más inclinada de los grandes. Nadie la ha visitado aún.'
};

export const HYGIEA: CelestialBody = {
  id: 'hygiea',
  name: 'Higia',
  type: 'asteroid',
  color: 0x7a7268,
  textureKind: 'rock',
  radiusKm: 217,
  axialTiltDeg: 0,
  rotationHours: 13.83,
  orbital: { a: 3.1415, e: 0.1125, iDeg: 3.842, OmegaDeg: 283.2, omegaDeg: 312.3, M0Deg: 152.2, periodDays: 2030.0 },
  physical: { massKg: '8,7 × 10¹⁹ kg', densityGcm3: 1.9, gravityMs2: 0.15, escapeKms: 0.26, meanTempC: '−110 °C' },
  structure: [
    { name: 'Roca/hielo primitivo', pct: 100, color: '#847b70', note: 'Casi esférico; candidato a planeta enano.' }
  ],
  atmosphere: { composition: [], pressure: 'Sin atmósfera', tempMean: '−110 °C', winds: '—', notes: 'Cuarto más grande del cinturón; sorprendentemente redondo.' },
  missions: [
    { name: 'VLT SPHERE', agency: 'ESO', year: '2019', highlight: 'Imágenes que revelaron su forma casi esférica.' }
  ],
  summary:
    'La esfera relajada: el cuarto mayor del cinturón, tan redondo que aspira a ser clasificado planeta enano.'
};

/* ---------------------------------------------------------------------------
 * REGISTROS DERIVADOS
 * ------------------------------------------------------------------------ */
export const PLANETS: CelestialBody[] = [
  MERCURY, VENUS, EARTH, MARS, JUPITER, SATURN, URANUS, NEPTUNE, PLUTO
];

export const MOONS: CelestialBody[] = [
  MOON, IO, EUROPA, GANYMEDE, CALLISTO, TITAN, ENCELADUS, MIMAS
];

export const NOTABLE_ASTEROIDS: CelestialBody[] = [CERES, VESTA, PALLAS, HYGIEA];

export const ALL_BODIES: CelestialBody[] = [
  SUN, ...PLANETS, ...MOONS, ...NOTABLE_ASTEROIDS
];

export const BODIES_BY_ID: Record<string, CelestialBody> = Object.fromEntries(
  ALL_BODIES.map((b) => [b.id, b])
);

export const BODY_TYPE_LABEL: Record<BodyType, string> = {
  star: 'Estrella',
  planet: 'Planeta',
  'dwarf-planet': 'Planeta enano',
  moon: 'Luna',
  asteroid: 'Asteroide'
};

export const J2000_EPOCH_MS = Date.UTC(2000, 0, 1, 12, 0, 0);
