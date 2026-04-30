"""
Flight Delay Prediction - Model Training Script
Trains ML models on flight_data_2024.csv and populates SQLite database
with statistics and pre-computed prediction data for the web dashboard.
"""

import pandas as pd
import numpy as np
import sqlite3
import os
import warnings
warnings.filterwarnings("ignore")

from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.tree import DecisionTreeClassifier
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import accuracy_score, classification_report
import json

DB_PATH = "flight_delay.db"
CSV_PATH = "flight_data_2024.csv"
SAMPLE_SIZE = 100000   # Sample rows for speed (full dataset is very large)
RANDOM_STATE = 42

print("=" * 60)
print("  FLIGHT DELAY PREDICTION — MODEL TRAINING")
print("=" * 60)

# ─────────────────────────────────────────────
# 1. LOAD DATA
# ─────────────────────────────────────────────
print("\n[1/7] Loading dataset...")
df = pd.read_csv(CSV_PATH, low_memory=False)
print(f"      Full dataset: {len(df):,} rows, {len(df.columns)} columns")

# Take a representative sample for faster training
df = df.sample(n=min(SAMPLE_SIZE, len(df)), random_state=RANDOM_STATE)
print(f"      Working sample: {len(df):,} rows")

# ─────────────────────────────────────────────
# 2. CLEAN & PREPROCESS
# ─────────────────────────────────────────────
print("\n[2/7] Cleaning data...")

# Rename columns for consistency
rename_map = {
    'day_of_week': 'DayOfWeek',
    'op_unique_carrier': 'UniqueCarrier',
    'origin': 'Origin',
    'dest': 'Dest',
    'dep_time': 'DepTime',
    'crs_dep_time': 'CRSDepTime',
    'arr_time': 'ArrTime',
    'crs_arr_time': 'CRSArrTime',
    'arr_delay': 'ArrDelay',
    'dep_delay': 'DepDelay',
    'taxi_in': 'TaxiIn',
    'taxi_out': 'TaxiOut',
    'carrier_delay': 'CarrierDelay',
    'weather_delay': 'WeatherDelay',
    'nas_delay': 'NASDelay',
    'late_aircraft_delay': 'LateAircraftDelay',
    'cancelled': 'Cancelled',
    'diverted': 'Diverted',
    'distance': 'Distance',
    'air_time': 'AirTime',
    'actual_elapsed_time': 'ActualElapsedTime',
    'crs_elapsed_time': 'CRSElapsedTime',
    'security_delay': 'SecurityDelay',
    'cancellation_code': 'CancellationCode',
    'year': 'Year',
    'month': 'Month',
    'day_of_month': 'DayofMonth',
    'op_carrier_fl_num': 'FlightNum',
    'origin_city_name': 'OriginCity',
    'dest_city_name': 'DestCity',
    'origin_state_nm': 'OriginState',
    'dest_state_nm': 'DestState',
}
df.rename(columns=rename_map, inplace=True)

# Drop rows where key columns are missing
required_cols = ['ArrDelay', 'DepDelay', 'UniqueCarrier', 'Origin', 'Dest', 'DayOfWeek', 'DepTime']
df.dropna(subset=required_cols, inplace=True)

# Fill delay-breakdown NaN with 0
delay_cols = ['CarrierDelay', 'WeatherDelay', 'NASDelay', 'LateAircraftDelay', 'SecurityDelay']
for col in delay_cols:
    if col in df.columns:
        df[col].fillna(0, inplace=True)

# Remove cancelled flights (no useful delay info)
if 'Cancelled' in df.columns:
    df = df[df['Cancelled'] == 0]

print(f"      Clean rows: {len(df):,}")

# ─────────────────────────────────────────────
# 3. FEATURE ENGINEERING
# ─────────────────────────────────────────────
print("\n[3/7] Engineering features...")

# Departure hour
df['DepHour'] = (df['DepTime'] / 100).astype(int).clip(0, 23)

# Time of day buckets
def time_of_day(h):
    if 5 <= h < 12:
        return 'Morning'
    elif 12 <= h < 17:
        return 'Afternoon'
    elif 17 <= h < 21:
        return 'Evening'
    else:
        return 'Night'

df['TimeOfDay'] = df['DepHour'].apply(time_of_day)

# Total delay components
comp_cols = [c for c in delay_cols if c in df.columns]
df['TotalDelay'] = df[comp_cols].sum(axis=1)

# Binary target: 1 if flight delayed >= 15 minutes
df['Delayed'] = (df['ArrDelay'] >= 15).astype(int)

# Route string
df['Route'] = df['Origin'] + ' → ' + df['Dest']

print(f"      Delayed rate: {df['Delayed'].mean()*100:.1f}%")

# ─────────────────────────────────────────────
# 4. TRAIN ML MODELS
# ─────────────────────────────────────────────
print("\n[4/7] Training ML models...")

features = ['DayOfWeek', 'DepHour', 'UniqueCarrier', 'Origin', 'Dest']
target = 'Delayed'

X = df[features].copy()
y = df[target]

# Encode categoricals
le_carrier = LabelEncoder()
le_origin = LabelEncoder()
le_dest = LabelEncoder()

X['UniqueCarrier'] = le_carrier.fit_transform(X['UniqueCarrier'].astype(str))
X['Origin'] = le_origin.fit_transform(X['Origin'].astype(str))
X['Dest'] = le_dest.fit_transform(X['Dest'].astype(str))

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=RANDOM_STATE)

models = {
    'Random Forest': RandomForestClassifier(n_estimators=100, random_state=RANDOM_STATE, n_jobs=-1),
    'Decision Tree': DecisionTreeClassifier(max_depth=8, random_state=RANDOM_STATE),
    'Logistic Regression': LogisticRegression(max_iter=500, random_state=RANDOM_STATE),
}

model_results = []
best_model = None
best_acc = 0

for name, model in models.items():
    print(f"      Training {name}...", end=" ")
    model.fit(X_train, y_train)
    y_pred = model.predict(X_test)
    acc = accuracy_score(y_test, y_pred)
    report = classification_report(y_test, y_pred, output_dict=True)
    precision = report['weighted avg']['precision']
    recall = report['weighted avg']['recall']
    f1 = report['weighted avg']['f1-score']
    print(f"Accuracy: {acc*100:.1f}%")
    model_results.append({
        'model_name': name,
        'accuracy': round(acc * 100, 2),
        'precision': round(precision * 100, 2),
        'recall': round(recall * 100, 2),
        'f1_score': round(f1 * 100, 2),
    })
    if acc > best_acc:
        best_acc = acc
        best_model = model

print(f"      Best model: {model_results[0]['model_name'] if best_model else 'RF'}")

# ─────────────────────────────────────────────
# 5. COMPUTE STATISTICS
# ─────────────────────────────────────────────
print("\n[5/7] Computing statistics...")

# Average delay by carrier
carrier_stats = df.groupby('UniqueCarrier').agg(
    avg_delay=('ArrDelay', 'mean'),
    delayed_pct=('Delayed', lambda x: x.mean() * 100),
    total_flights=('ArrDelay', 'count'),
    cancelled_pct=('Cancelled', lambda x: x.mean() * 100) if 'Cancelled' in df.columns else ('ArrDelay', lambda x: 0)
).reset_index()
carrier_stats['avg_delay'] = carrier_stats['avg_delay'].round(2)
carrier_stats['delayed_pct'] = carrier_stats['delayed_pct'].round(2)
# Only carriers with enough flights
carrier_stats = carrier_stats[carrier_stats['total_flights'] >= 50].sort_values('avg_delay', ascending=False)

# Average delay by hour
hour_stats = df.groupby('DepHour').agg(
    avg_delay=('ArrDelay', 'mean'),
    delayed_pct=('Delayed', lambda x: x.mean() * 100),
    total_flights=('ArrDelay', 'count')
).reset_index()
hour_stats['avg_delay'] = hour_stats['avg_delay'].round(2)
hour_stats['delayed_pct'] = hour_stats['delayed_pct'].round(2)

# Average delay by day of week
day_names = {1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday',
             5: 'Friday', 6: 'Saturday', 7: 'Sunday'}
day_stats = df.groupby('DayOfWeek').agg(
    avg_delay=('ArrDelay', 'mean'),
    delayed_pct=('Delayed', lambda x: x.mean() * 100),
    total_flights=('ArrDelay', 'count')
).reset_index()
day_stats['day_name'] = day_stats['DayOfWeek'].map(day_names)
day_stats['avg_delay'] = day_stats['avg_delay'].round(2)
day_stats['delayed_pct'] = day_stats['delayed_pct'].round(2)

# Top delayed routes
route_stats = df.groupby('Route').agg(
    avg_delay=('ArrDelay', 'mean'),
    delayed_pct=('Delayed', lambda x: x.mean() * 100),
    total_flights=('ArrDelay', 'count')
).reset_index()
route_stats = route_stats[route_stats['total_flights'] >= 20].sort_values('avg_delay', ascending=False)
route_stats['avg_delay'] = route_stats['avg_delay'].round(2)
route_stats['delayed_pct'] = route_stats['delayed_pct'].round(2)
top_routes = route_stats.head(15)

# Delay breakdown (avg components)
delay_breakdown = {}
for col in comp_cols:
    delay_breakdown[col.replace('Delay', '').strip()] = round(float(df[col].mean()), 2)

# Overall stats
overall_stats = {
    'total_flights': int(len(df)),
    'delayed_flights': int(df['Delayed'].sum()),
    'delayed_pct': round(float(df['Delayed'].mean() * 100), 2),
    'avg_delay_minutes': round(float(df['ArrDelay'].mean()), 2),
    'max_delay_minutes': round(float(df['ArrDelay'].max()), 2),
    'delay_breakdown': delay_breakdown
}

# Get unique values for prediction dropdowns
unique_carriers = sorted(df['UniqueCarrier'].unique().tolist())
unique_origins = sorted(df['Origin'].unique().tolist())
unique_dests = sorted(df['Dest'].unique().tolist())

# ─────────────────────────────────────────────
# 6. BUILD LOOKUP TABLES FOR PREDICTION
# ─────────────────────────────────────────────
print("\n[6/7] Building prediction lookup tables...")

# Per-carrier average delay (for fast predictions)
carrier_avg = df.groupby('UniqueCarrier')['ArrDelay'].mean().to_dict()
origin_avg = df.groupby('Origin')['ArrDelay'].mean().to_dict()
dest_avg = df.groupby('Dest')['ArrDelay'].mean().to_dict()
hour_avg = df.groupby('DepHour')['ArrDelay'].mean().to_dict()
day_avg = df.groupby('DayOfWeek')['ArrDelay'].mean().to_dict()

# Overall mean (fallback)
global_mean = float(df['ArrDelay'].mean())

prediction_model_data = {
    'carrier_avg': {k: round(v, 2) for k, v in carrier_avg.items()},
    'origin_avg': {k: round(v, 2) for k, v in origin_avg.items()},
    'dest_avg': {k: round(v, 2) for k, v in dest_avg.items()},
    'hour_avg': {k: round(v, 2) for k, v in hour_avg.items()},
    'day_avg': {k: round(v, 2) for k, v in day_avg.items()},
    'global_mean': round(global_mean, 2)
}

# ─────────────────────────────────────────────
# 7. WRITE TO SQLITE
# ─────────────────────────────────────────────
print("\n[7/7] Writing to SQLite database...")

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

# Drop all existing tables so we can recreate fresh data
TABLES = ['carrier_stats', 'hour_stats', 'day_stats', 'route_stats',
          'model_results', 'overall_stats', 'prediction_model', 'dropdown_options']
for t in TABLES:
    cur.execute(f"DROP TABLE IF EXISTS {t}")
conn.commit()

# ── carrier_stats ──
cur.execute("""
    CREATE TABLE carrier_stats (
        carrier TEXT PRIMARY KEY,
        avg_delay REAL,
        delayed_pct REAL,
        total_flights INTEGER,
        cancelled_pct REAL
    )
""")
for _, row in carrier_stats.iterrows():
    cur.execute("INSERT INTO carrier_stats VALUES (?,?,?,?,?)",
                (row['UniqueCarrier'], row['avg_delay'], row['delayed_pct'],
                 int(row['total_flights']), float(row.get('cancelled_pct', 0))))

# ── hour_stats ──
cur.execute("""
    CREATE TABLE hour_stats (
        dep_hour INTEGER PRIMARY KEY,
        avg_delay REAL,
        delayed_pct REAL,
        total_flights INTEGER
    )
""")
for _, row in hour_stats.iterrows():
    cur.execute("INSERT INTO hour_stats VALUES (?,?,?,?)",
                (int(row['DepHour']), row['avg_delay'], row['delayed_pct'], int(row['total_flights'])))

# ── day_stats ──
cur.execute("""
    CREATE TABLE day_stats (
        day_of_week INTEGER,
        day_name TEXT,
        avg_delay REAL,
        delayed_pct REAL,
        total_flights INTEGER
    )
""")
for _, row in day_stats.iterrows():
    cur.execute("INSERT INTO day_stats VALUES (?,?,?,?,?)",
                (int(row['DayOfWeek']), row['day_name'], row['avg_delay'],
                 row['delayed_pct'], int(row['total_flights'])))

# ── route_stats ──
cur.execute("""
    CREATE TABLE route_stats (
        route TEXT PRIMARY KEY,
        avg_delay REAL,
        delayed_pct REAL,
        total_flights INTEGER
    )
""")
for _, row in top_routes.iterrows():
    cur.execute("INSERT INTO route_stats VALUES (?,?,?,?)",
                (row['Route'], row['avg_delay'], row['delayed_pct'], int(row['total_flights'])))

# ── model_results ──
cur.execute("""
    CREATE TABLE model_results (
        model_name TEXT PRIMARY KEY,
        accuracy REAL,
        precision REAL,
        recall REAL,
        f1_score REAL
    )
""")
for r in model_results:
    cur.execute("INSERT INTO model_results VALUES (?,?,?,?,?)",
                (r['model_name'], r['accuracy'], r['precision'], r['recall'], r['f1_score']))

# ── overall_stats (as key-value JSON) ──
cur.execute("CREATE TABLE overall_stats (key TEXT PRIMARY KEY, value TEXT)")
for k, v in overall_stats.items():
    cur.execute("INSERT INTO overall_stats VALUES (?,?)", (k, json.dumps(v)))

# ── prediction_model (lookup tables as JSON) ──
cur.execute("CREATE TABLE prediction_model (key TEXT PRIMARY KEY, value TEXT)")
for k, v in prediction_model_data.items():
    cur.execute("INSERT INTO prediction_model VALUES (?,?)", (k, json.dumps(v)))

# ── dropdown options ──
cur.execute("CREATE TABLE dropdown_options (type TEXT, value TEXT)")
for c in unique_carriers:
    cur.execute("INSERT INTO dropdown_options VALUES ('carrier', ?)", (c,))
for o in unique_origins[:200]:  # cap at 200
    cur.execute("INSERT INTO dropdown_options VALUES ('origin', ?)", (o,))
for d in unique_dests[:200]:
    cur.execute("INSERT INTO dropdown_options VALUES ('dest', ?)", (d,))

conn.commit()
conn.close()

print(f"      Database saved to: {DB_PATH}")
print("\n" + "=" * 60)
print("  TRAINING COMPLETE!")
print("=" * 60)
print(f"  Models trained: {len(model_results)}")
for r in model_results:
    print(f"    • {r['model_name']}: {r['accuracy']}% accuracy")
print(f"  Carriers analyzed: {len(carrier_stats)}")
print(f"  Top routes stored: {len(top_routes)}")
print(f"\n  ✅  Run 'node server.js' to start the web server")
print("=" * 60 + "\n")
