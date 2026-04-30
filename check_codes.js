const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('flight_delay.db', sqlite3.OPEN_READONLY);
db.all("SELECT DISTINCT value FROM dropdown_options WHERE type='origin' ORDER BY value", [], (err, rows) => {
    if (err) console.error(err);
    else {
        const codes = rows.map(r => r.value.trim());
        console.log('COUNT:', codes.length);
        // Print all in one line to file
        const fs = require('fs');
        fs.writeFileSync('codes_out.txt', codes.join('\n'));
        console.log('Written to codes_out.txt');
    }
    db.close();
});
