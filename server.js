/**
 * Flight Delay Prediction — Express.js Backend
 * Serves static files + REST API backed by SQLite
 */

const express = require('express');
const path = require('path');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'flight_delay.db');


// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));


// Open database

const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.warn('⚠  DB not found. Run train_model.py first. Starting in demo mode.');
  } else {
    console.log('✅  SQLite database connected:', DB_PATH);
  }
});

// Promisified query helpers
const dbAll = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows))));

const dbGet = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row))));

// common error handler
function apiErr(res, e) {
  const msg = e.message || String(e);
  console.error('[API Error]', msg);
  res.status(500).json({ error: msg });
}

// ── IATA Airport Code → Full Name Map ──────────────────────────
const AIRPORT_NAMES = {
  JKH: 'Chios Island National Airport', ABE: 'Lehigh Valley Intl (Allentown, PA)', ABI: 'Abilene Regional (TX)',
  ABQ: 'Albuquerque Intl Sunport (NM)', ABR: 'Aberdeen Regional (SD)', ABY: 'Southwest Georgia Regional (Albany)',
  ACT: 'Waco Regional (TX)', ACV: 'Arcata/Eureka Airport (CA)', ACY: 'Atlantic City Intl (NJ)',
  ADK: 'Adak Airport (AK)', ADQ: 'Kodiak Airport (AK)', AEX: 'Alexandria Intl (LA)',
  AGS: 'Augusta Regional (GA)', ALB: 'Albany Intl (NY)', ALW: 'Walla Walla Regional (WA)',
  AMA: 'Rick Husband Amarillo Intl (TX)', ANC: 'Ted Stevens Anchorage Intl (AK)', APN: 'Alpena County Regional (MI)',
  ASE: 'Aspen-Pitkin County Airport (CO)', ATL: 'Hartsfield-Jackson Atlanta Intl (GA)', ATW: 'Appleton Intl (WI)',
  AUS: 'Austin-Bergstrom Intl (TX)', AVL: 'Asheville Regional (NC)', AVP: 'Wilkes-Barre/Scranton Intl (PA)',
  AZA: 'Phoenix-Mesa Gateway Airport (AZ)', AZO: 'Kalamazoo/Battle Creek Intl (MI)',
  BDL: 'Bradley Intl (Hartford/Springfield, CT)', BET: 'Bethel Airport (AK)', BFF: 'Western Nebraska Regional (Scottsbluff)',
  BFL: 'Meadows Field (Bakersfield, CA)', BGM: 'Greater Binghamton Airport (NY)', BGR: 'Bangor Intl (ME)',
  BHM: 'Birmingham-Shuttlesworth Intl (AL)', BIH: 'Eastern Sierra Regional (Bishop, CA)', BIL: 'Billings Logan Intl (MT)',
  BIS: 'Bismarck Municipal (ND)', BJI: 'Bemidji Regional (MN)', BLI: 'Bellingham Intl (WA)',
  BLV: 'MidAmerica St. Louis Airport (IL)', BMI: 'Central Illinois Regional (Bloomington)', BNA: 'Nashville Intl (TN)',
  BOI: 'Boise Airport (ID)', BOS: 'Boston Logan Intl (MA)', BPT: 'Jack Brooks Regional (Beaumont, TX)',
  BQK: 'Brunswick Golden Isles Airport (GA)', BQN: 'Rafael Hernández Airport (Aguadilla, PR)', BRD: 'Brainerd Lakes Regional (MN)',
  BRO: 'South Padre Island Intl (Brownsville, TX)', BRW: 'Wiley Post–Will Rogers Memorial (Utqiagvik, AK)',
  BTM: 'Bert Mooney Airport (Butte, MT)', BTR: 'Baton Rouge Metro Airport (LA)', BTV: 'Burlington Intl (VT)',
  BUF: 'Buffalo Niagara Intl (NY)', BUR: 'Hollywood Burbank Airport (CA)', BWI: 'Baltimore/Washington Intl (MD)',
  BZN: 'Bozeman Yellowstone Intl (MT)', CAE: 'Columbia Metropolitan (SC)', CAK: 'Akron-Canton Regional (OH)',
  CDC: 'Cedar City Regional (UT)', CDV: 'Merle K. Smith Airport (Cordova, AK)', CHA: 'Chattanooga Metropolitan (TN)',
  CHO: 'Charlottesville-Albemarle Airport (VA)', CHS: 'Charleston Intl (SC)', CID: 'The Eastern Iowa Airport (Cedar Rapids)',
  CIU: 'Chippewa County Intl (Sault Ste. Marie, MI)', CKB: 'North Central West Virginia Airport', CLE: 'Cleveland Hopkins Intl (OH)',
  CLL: 'Easterwood Airport (College Station, TX)', CLT: 'Charlotte Douglas Intl (NC)', CMH: 'John Glenn Columbus Intl (OH)',
  CMI: 'University of Illinois Willard Airport', CMX: 'Houghton County Memorial (MI)', CNY: 'Canyonlands Field (Moab, UT)',
  COS: 'Colorado Springs Airport', COU: 'Columbia Regional (MO)', CPR: 'Casper/Natrona County Intl (WY)',
  CRP: 'Corpus Christi Intl (TX)', CRW: 'Yeager Airport (Charleston, WV)', CSG: 'Columbus Metropolitan (GA)',
  CVG: 'Cincinnati/Northern Kentucky Intl', CWA: 'Central Wisconsin Airport (Wausau)', CYS: 'Cheyenne Regional (WY)',
  DAB: 'Daytona Beach Intl (FL)', DAL: 'Dallas Love Field (TX)', DAY: 'Dayton Intl (OH)',
  DCA: 'Ronald Reagan Washington National (DC)', DDC: 'Dodge City Regional (KS)', DEC: 'Decatur Airport (IL)',
  DEN: 'Denver Intl (CO)', DFW: 'Dallas/Fort Worth Intl (TX)', DHN: 'Dothan Regional (AL)',
  DIK: 'Dickinson Theodore Roosevelt Regional (ND)', DLH: 'Duluth Intl (MN)', DRO: 'Durango-La Plata County Airport (CO)',
  DSM: 'Des Moines Intl (IA)', DTW: 'Detroit Metropolitan Wayne County (MI)', DVL: 'Devils Lake Regional (ND)',
  ECP: 'Northwest Florida Beaches Intl (Panama City)', EGE: 'Eagle County Regional (CO)', EKO: 'Elko Regional (NV)',
  ELM: 'Elmira/Corning Regional (NY)', ELP: 'El Paso Intl (TX)', ESC: 'Delta County Airport (Escanaba, MI)',
  EUG: 'Eugene Airport (OR)', EVV: 'Evansville Regional (IN)', EWR: 'Newark Liberty Intl (NJ)',
  EYW: 'Key West Intl (FL)', FAI: 'Fairbanks Intl (AK)', FAR: 'Hector Intl (Fargo, ND)',
  FAT: 'Fresno Yosemite Intl (CA)', FAY: 'Fayetteville Regional (NC)', FCA: 'Glacier Park Intl (Kalispell, MT)',
  FLG: 'Flagstaff Pulliam Airport (AZ)', FLL: 'Fort Lauderdale-Hollywood Intl (FL)', FNT: 'Bishop Intl (Flint, MI)',
  FOD: 'Fort Dodge Regional (IA)', FSD: 'Sioux Falls Regional/Joe Foss Field (SD)', FSM: 'Fort Smith Regional (AR)',
  FWA: 'Fort Wayne Intl (IN)', GCC: 'Gillette-Campbell County Airport (WY)', GCK: 'Garden City Regional (KS)',
  GEG: 'Spokane Intl (WA)', GFK: 'Grand Forks Intl (ND)', GGG: 'East Texas Regional (Longview)',
  GJT: 'Grand Junction Regional (CO)', GNV: 'Gainesville Regional (FL)', GPT: 'Gulfport-Biloxi Intl (MS)',
  GRB: 'Austin Straubel Intl (Green Bay, WI)', GRI: 'Central Nebraska Regional (Grand Island)', GRK: 'Killeen-Fort Hood Regional (TX)',
  GRR: 'Gerald R. Ford Intl (Grand Rapids, MI)', GSO: 'Piedmont Triad Intl (Greensboro, NC)', GSP: 'Greenville-Spartanburg Intl (SC)',
  GTF: 'Great Falls Intl (MT)', GTR: 'Golden Triangle Regional (Columbus, MS)', GUC: 'Gunnison-Crested Butte Regional (CO)',
  GUM: 'Antonio B. Won Pat Intl (Guam)', HDN: 'Yampa Valley Airport (Hayden, CO)', HHH: 'Hilton Head Airport (SC)',
  HIB: 'Range Regional (Hibbing, MN)', HLN: 'Helena Regional (MT)', HNL: 'Daniel K. Inouye Intl (Honolulu, HI)',
  HOU: 'William P. Hobby Airport (Houston, TX)', HPN: 'Westchester County Airport (White Plains, NY)', HRL: 'Valley Intl (Harlingen, TX)',
  HSV: 'Huntsville Intl (AL)', HTS: 'Tri-State Milton J. Ferguson Field (Huntington, WV)', HYS: 'Hays Regional (KS)',
  IAD: 'Washington Dulles Intl (DC)', IAG: 'Niagara Falls Intl (NY)', IAH: 'George Bush Intercontinental (Houston, TX)',
  ICT: 'Wichita Dwight D. Eisenhower National (KS)', IDA: 'Idaho Falls Regional', ILM: 'Wilmington Intl (NC)',
  IMT: 'Ford Airport (Iron Mountain, MI)', IND: 'Indianapolis Intl (IN)', INL: 'Falls Intl Einarson Field (International Falls, MN)',
  ISP: 'Long Island MacArthur Airport (NY)', ITH: 'Ithaca Tompkins Regional (NY)', ITO: 'Hilo Intl (HI)',
  JAC: 'Jackson Hole Airport (WY)', JAN: 'Jackson-Medgar Wiley Evers Intl (MS)', JAX: 'Jacksonville Intl (FL)',
  JFK: 'John F. Kennedy Intl (New York, NY)', JLN: 'Joplin Regional (MO)', JMS: 'Jamestown Regional (ND)',
  JNU: 'Juneau Intl (AK)', JST: 'John Murtha Johnstown-Cambria County Airport (PA)', KOA: 'Ellison Onizuka Kona Intl (HI)',
  KTN: 'Ketchikan Intl (AK)', LAN: 'Capital Region Intl (Lansing, MI)', LAR: 'Laramie Regional (WY)',
  LAS: 'Harry Reid Intl (Las Vegas, NV)', LAW: 'Lawton-Fort Sill Regional (OK)', LAX: 'Los Angeles Intl (CA)',
  LBB: 'Lubbock Preston Smith Intl (TX)', LBE: 'Arnold Palmer Regional (Latrobe, PA)', LBF: 'North Platte Regional (NE)',
  LBL: 'Liberal Mid-America (KS)', LCH: 'Lake Charles Regional (LA)', LCK: 'Rickenbacker Intl (Columbus, OH)',
  LEX: 'Blue Grass Airport (Lexington, KY)', LFT: 'Lafayette Regional (LA)', LGA: 'LaGuardia Airport (New York, NY)',
  LGB: 'Long Beach Airport (CA)', LIH: 'Lihue Airport (Kauai, HI)', LIT: 'Bill and Hillary Clinton National (Little Rock, AR)',
  LNK: 'Lincoln Airport (NE)', LRD: 'Laredo Intl (TX)', LSE: 'La Crosse Regional (WI)',
  LWS: 'Lewiston-Nez Perce County Airport (ID)', MAF: 'Midland Intl Air & Space Port (TX)', MBS: 'MBS Intl (Saginaw, MI)',
  MCI: 'Kansas City Intl (MO)', MCO: 'Orlando Intl (FL)', MCW: 'Mason City Municipal (IA)',
  MDT: 'Harrisburg Intl (PA)', MDW: 'Chicago Midway Intl (IL)', MEI: 'Meridian Regional (MS)',
  MEM: 'Memphis Intl (TN)', MFE: 'McAllen Miller Intl (TX)', MFR: 'Rogue Valley Intl (Medford, OR)',
  MGM: 'Montgomery Regional (AL)', MHK: 'Manhattan Regional (KS)', MHT: 'Manchester-Boston Regional (NH)',
  MIA: 'Miami Intl (FL)', MKE: 'Milwaukee Mitchell Intl (WI)', MKG: 'Muskegon County Airport (MI)',
  MLB: 'Melbourne Orlando Intl (FL)', MLI: 'Quad City Intl (Moline, IL)', MLU: 'Monroe Regional (LA)',
  MMH: 'Mammoth Yosemite Airport (CA)', MOB: 'Mobile Regional (AL)', MOD: 'Modesto City-County Airport (CA)',
  MOT: 'Minot Intl (ND)', MQT: 'Sawyer Intl (Marquette, MI)', MRY: 'Monterey Regional (CA)',
  MSN: 'Dane County Regional (Madison, WI)', MSO: 'Missoula Montana Airport', MSP: 'Minneapolis-Saint Paul Intl (MN)',
  MSY: 'Louis Armstrong New Orleans Intl (LA)', MTJ: 'Montrose Regional (CO)', MYR: 'Myrtle Beach Intl (SC)',
  OAJ: 'Albert J. Ellis Airport (Jacksonville, NC)', OAK: 'Oakland Intl (CA)', OGG: 'Kahului Airport (Maui, HI)',
  OKC: 'Will Rogers World Airport (Oklahoma City, OK)', OMA: 'Eppley Airfield (Omaha, NE)', OME: 'Nome Airport (AK)',
  ONT: 'Ontario Intl (CA)', ORD: "O'Hare Intl (Chicago, IL)", ORF: 'Norfolk Intl (VA)',
  OTZ: 'Ralph Wien Memorial Airport (Kotzebue, AK)', OWB: 'Owensboro-Daviess County Regional (KY)', PAH: 'Barkley Regional (Paducah, KY)',
  PBI: 'Palm Beach Intl (FL)', PDX: 'Portland Intl (OR)', PHF: 'Newport News/Williamsburg Intl (VA)',
  PHL: 'Philadelphia Intl (PA)', PHX: 'Phoenix Sky Harbor Intl (AZ)', PIA: 'General Wayne A. Downing Peoria Intl (IL)',
  PIB: 'Hattiesburg-Laurel Regional (MS)', PIH: 'Pocatello Regional (ID)', PIT: 'Pittsburgh Intl (PA)',
  PLN: 'Pellston Regional (MI)', PNS: 'Pensacola Intl (FL)', PPG: 'Pago Pago Intl (American Samoa)',
  PSC: 'Tri-Cities Airport (Pasco, WA)', PSE: 'Mercedita Airport (Ponce, PR)', PSG: 'Petersburg James A. Johnson Airport (AK)',
  PSP: 'Palm Springs Intl (CA)', PUB: 'Pueblo Memorial Airport (CO)', PVD: 'T.F. Green Airport (Providence, RI)',
  PVU: 'Provo Airport (UT)', PWM: 'Portland Intl Jetport (ME)', RAP: 'Rapid City Regional (SD)',
  RDD: 'Redding Municipal (CA)', RDM: 'Roberts Field (Redmond, OR)', RDU: 'Raleigh-Durham Intl (NC)',
  RFD: 'Chicago Rockford Intl (IL)', RHI: 'Rhinelander-Oneida County Airport (WI)', RIC: 'Richmond Intl (VA)',
  RNO: 'Reno-Tahoe Intl (NV)', ROA: 'Roanoke-Blacksburg Regional (VA)', ROC: 'Greater Rochester Intl (NY)',
  RST: 'Rochester Intl (MN)', RSW: 'Southwest Florida Intl (Fort Myers)', SAF: 'Santa Fe Municipal (NM)',
  SAN: 'San Diego Intl (CA)', SAT: 'San Antonio Intl (TX)', SAV: 'Savannah/Hilton Head Intl (GA)',
  SBA: 'Santa Barbara Municipal (CA)', SBN: 'South Bend Intl (IN)', SBP: 'San Luis Obispo County Regional (CA)',
  SCC: 'Deadhorse Airport (AK)', SCE: 'University Park Airport (State College, PA)', SDF: 'Louisville Intl (KY)',
  SEA: 'Seattle-Tacoma Intl (WA)', SFO: 'San Francisco Intl (CA)', SGF: 'Springfield-Branson National (MO)',
  SGU: 'St. George Regional (UT)', SHV: 'Shreveport Regional (LA)', SIT: 'Sitka Rocky Gutierrez Airport (AK)',
  SJC: 'Norman Y. Mineta San José Intl (CA)', SJT: 'San Angelo Regional (TX)', SJU: 'Luis Muñoz Marín Intl (San Juan, PR)',
  SLC: 'Salt Lake City Intl (UT)', SLE: 'Salem Airport (OR)', SMF: 'Sacramento Intl (CA)',
  SMX: 'Santa Maria Public Airport (CA)', SNA: 'John Wayne Airport (Orange County, CA)', SPI: 'Abraham Lincoln Capital Airport (Springfield, IL)',
  SPS: 'Sheppard Air Force Base (Wichita Falls, TX)', SRQ: 'Sarasota-Bradenton Intl (FL)', STL: 'St. Louis Lambert Intl (MO)',
  STT: 'Cyril E. King Airport (St. Thomas, VI)', STX: 'Henry E. Rohlsen Airport (St. Croix, VI)', SUN: 'Friedman Memorial Airport (Hailey, ID)',
  SUX: 'Sioux Gateway/Col. Bud Day Field (IA)', SWF: 'New York Stewart Intl (Newburgh, NY)', SYR: 'Syracuse Hancock Intl (NY)',
  TLH: 'Tallahassee Intl (FL)', TOL: 'Toledo Express Airport (OH)', TPA: 'Tampa Intl (FL)',
  TRI: 'Tri-Cities Regional (Bristol/Johnson City, TN)', TTN: 'Trenton-Mercer Airport (NJ)', TUL: 'Tulsa Intl (OK)',
  TUS: 'Tucson Intl (AZ)', TVC: 'Cherry Capital Airport (Traverse City, MI)', TWF: 'Magic Valley Regional (Twin Falls, ID)',
  TXK: 'Texarkana Regional (AR)', TYR: 'Tyler Pounds Regional (TX)', TYS: 'McGhee Tyson Airport (Knoxville, TN)',
  UIN: 'Quincy Regional (IL)', VEL: 'Vernal Regional (UT)', VLD: 'Valdosta Regional (GA)',
  VPS: 'Destin-Fort Walton Beach Airport (FL)', WRG: 'Wrangell Airport (AK)', WYS: 'Yellowstone Airport (West Yellowstone, MT)',
  XNA: 'Northwest Arkansas National Airport', YAK: 'Yakutat Airport (AK)', YKM: 'Yakima Air Terminal (WA)',
  YUM: 'Yuma Intl (AZ)'
};

function airportLabel(code) {
  const c = (code || '').trim();
  return AIRPORT_NAMES[c] ? `${c} – ${AIRPORT_NAMES[c]}` : c;
}


// API Routes



// -- Overall statistics --
app.get('/api/stats/overall', async (req, res) => {
  try {
    const rows = await dbAll('SELECT key, value FROM overall_stats');
    const result = {};
    rows.forEach(r => { result[r.key] = JSON.parse(r.value); });
    res.json(result);
  } catch (e) { apiErr(res, e); }
});

// -- Carrier stats --
app.get('/api/stats/carriers', async (req, res) => {
  try {
    const rows = await dbAll(
      'SELECT carrier, avg_delay, delayed_pct, total_flights FROM carrier_stats ORDER BY avg_delay DESC LIMIT 20'
    );
    res.json(rows);
  } catch (e) { apiErr(res, e); }
});

// -- Hourly stats --
app.get('/api/stats/hours', async (req, res) => {
  try {
    const rows = await dbAll(
      'SELECT dep_hour, avg_delay, delayed_pct, total_flights FROM hour_stats ORDER BY dep_hour'
    );
    res.json(rows);
  } catch (e) { apiErr(res, e); }
});

// -- Day of week stats --
app.get('/api/stats/days', async (req, res) => {
  try {
    const rows = await dbAll(
      'SELECT day_of_week, day_name, avg_delay, delayed_pct, total_flights FROM day_stats ORDER BY day_of_week'
    );
    res.json(rows);
  } catch (e) { apiErr(res, e); }
});

// -- Top delayed routes --
app.get('/api/stats/routes', async (req, res) => {
  try {
    const rows = await dbAll(
      'SELECT route, avg_delay, delayed_pct, total_flights FROM route_stats ORDER BY avg_delay DESC LIMIT 15'
    );
    res.json(rows);
  } catch (e) { apiErr(res, e); }
});

// -- Model performance --
app.get('/api/stats/models', async (req, res) => {
  try {
    const rows = await dbAll(
      'SELECT model_name, accuracy, precision, recall, f1_score FROM model_results ORDER BY accuracy DESC'
    );
    res.json(rows);
  } catch (e) { apiErr(res, e); }
});

// -- Dropdown options --
app.get('/api/options/:type', async (req, res) => {
  const allowed = ['carrier', 'origin', 'dest'];
  if (!allowed.includes(req.params.type)) {
    return res.status(400).json({ error: 'Invalid type' });
  }
  try {
    const rows = await dbAll(
      'SELECT value FROM dropdown_options WHERE type = ? ORDER BY value',
      [req.params.type]
    );
    if (req.params.type === 'origin' || req.params.type === 'dest') {
      // Return {code, label} for airports so frontend can show full names
      res.json(rows.map(r => ({
        code: r.value.trim(),
        label: airportLabel(r.value)
      })));
    } else {
      res.json(rows.map(r => r.value));
    }
  } catch (e) { apiErr(res, e); }
});


// PREDICTION ENDPOINT

app.post('/api/predict', async (req, res) => {
  const { carrier, origin, dest, day_of_week, dep_hour } = req.body;

  if (!carrier || !origin || !dest || day_of_week === undefined || dep_hour === undefined) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Load lookup tables from DB
    const modelRows = await dbAll('SELECT key, value FROM prediction_model');
    const model = {};
    modelRows.forEach(r => { model[r.key] = JSON.parse(r.value); });

    const globalMean = model.global_mean || 10;
    const carrierDelay = model.carrier_avg?.[carrier] ?? globalMean;
    const originDelay = model.origin_avg?.[origin] ?? globalMean;
    const destDelay = model.dest_avg?.[dest] ?? globalMean;
    const hourDelay = model.hour_avg?.[String(parseInt(dep_hour))] ?? globalMean;
    const dayDelay = model.day_avg?.[String(parseInt(day_of_week))] ?? globalMean;

    const predictedDelay = Math.round(
      0.30 * carrierDelay +
      0.20 * originDelay +
      0.20 * destDelay +
      0.15 * hourDelay +
      0.15 * dayDelay
    );

    const isDelayed = predictedDelay >= 15;
    const confidence = Math.min(95, Math.max(55, 75 + Math.abs(predictedDelay - 15)));

    // Time-of-day label
    const h = parseInt(dep_hour);
    let timeOfDay = 'Night';
    if (h >= 5 && h < 12) timeOfDay = 'Morning';
    else if (h >= 12 && h < 17) timeOfDay = 'Afternoon';
    else if (h >= 17 && h < 21) timeOfDay = 'Evening';

    const factors = [
      { label: 'Airline', contribution: Math.round(0.30 * carrierDelay), value: carrierDelay },
      { label: 'Origin Airport', contribution: Math.round(0.20 * originDelay), value: originDelay },
      { label: 'Destination Airport', contribution: Math.round(0.20 * destDelay), value: destDelay },
      { label: 'Time of Day', contribution: Math.round(0.15 * hourDelay), value: hourDelay },
      { label: 'Day of Week', contribution: Math.round(0.15 * dayDelay), value: dayDelay },
    ];

    res.json({
      carrier, origin, dest,
      day_of_week: parseInt(day_of_week),
      dep_hour: parseInt(dep_hour),
      time_of_day: timeOfDay,
      predicted_delay_minutes: Math.max(0, predictedDelay),
      is_delayed: isDelayed,
      confidence_pct: confidence,
      status: isDelayed ? 'DELAYED' : 'ON TIME',
      factors,
    });
  } catch (e) { apiErr(res, e); }
});

// ────────────────────────────────────────────
// Start server
// ────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  Flight Delay Prediction Server`);
  console.log(`    Running at: http://localhost:${PORT}`);
  console.log(`    Open in browser: http://localhost:${PORT}\n`);
});
