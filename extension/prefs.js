// GNOME's own "extension settings" entry point. It shows the same window as the Manicule app.

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {Pages} from './lib/pages.js';

export default class ManiculePrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        new Pages(this.path, this.metadata['version-name']).fill(window, this.getSettings());
    }
}
