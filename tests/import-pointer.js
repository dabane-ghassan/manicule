// gjs -m tests/import-pointer.js image.png  -> prints the pointer entry as JSON, or fails with the reason
import GLib from 'gi://GLib';
import System from 'system';

const here = GLib.path_get_dirname(GLib.filename_from_uri(import.meta.url)[0]);
const {importPointer} = await import(`file://${here}/../extension/lib/importer.js`);
try {
    print(JSON.stringify(importPointer(ARGV[0])));
} catch (e) {
    printerr(e.message);
    System.exit(1);
}
