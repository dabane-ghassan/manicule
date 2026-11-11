// Small shims so one code base runs on GNOME Shell 45 through 51.

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import St from 'gi://St';

export function getSeat() {
    // Clutter.get_default_backend() was removed in GNOME 51.
    const backend = Clutter.get_default_backend
        ? Clutter.get_default_backend()
        : global.stage.context.get_backend();
    return backend.get_default_seat();
}

function cursorTracker() {
    // Moved from Meta.CursorTracker.get_for_display() to the backend in GNOME 48.
    if (global.backend?.get_cursor_tracker)
        return global.backend.get_cursor_tracker();
    return Meta.CursorTracker.get_for_display(global.display);
}

/** Hides the system cursor and keeps it hidden until show() is called. */
export class CursorHider {
    constructor() {
        this._tracker = cursorTracker();
        this._hidden = false;
        this._signal = 0;
    }

    get hidden() {
        return this._hidden;
    }

    hide() {
        if (this._hidden)
            return;
        this._hidden = true;
        // With the cursor hidden Mutter also drops pointer focus (it assumes touch input),
        // and clicks would stop arriving. Ask it not to.
        this._seat = getSeat();
        this._seat.inhibit_unfocus?.();
        if (this._tracker.inhibit_cursor_visibility) {
            // GNOME 49+: a counted inhibition that Mutter will not undo behind our back.
            this._tracker.inhibit_cursor_visibility();
            return;
        }
        // Older Mutter shows the cursor again whenever the last-used input device changes,
        // which happens each time Manicule forwards a scroll. Re-hide when that happens.
        this._tracker.set_pointer_visible(false);
        this._signal = this._tracker.connect('visibility-changed', () => {
            if (this._hidden && this._tracker.get_pointer_visible())
                this._tracker.set_pointer_visible(false);
        });
    }

    show() {
        if (!this._hidden)
            return;
        this._hidden = false;
        this._seat?.uninhibit_unfocus?.();
        this._seat = null;
        if (this._tracker.uninhibit_cursor_visibility) {
            this._tracker.uninhibit_cursor_visibility();
            return;
        }
        if (this._signal) {
            this._tracker.disconnect(this._signal);
            this._signal = 0;
        }
        this._tracker.set_pointer_visible(true);
    }
}

const hasOrientation = !!GObject.Object.find_property.call(St.BoxLayout, 'orientation');

/** St.BoxLayout's `vertical` was replaced by `orientation` (deprecated in 48, removed in 51). */
export function boxProps(vertical, props = {}) {
    if (hasOrientation)
        return {...props, orientation: vertical ? Clutter.Orientation.VERTICAL : Clutter.Orientation.HORIZONTAL};
    return {...props, vertical};
}

export function setUnredirect(disabled) {
    // Keeps fullscreen windows composited so the overlay can be drawn above them (matters on X11).
    try {
        if (global.compositor?.disable_unredirect) {
            if (disabled)
                global.compositor.disable_unredirect();
            else
                global.compositor.enable_unredirect();
        } else if (Meta.disable_unredirect_for_display) {
            if (disabled)
                Meta.disable_unredirect_for_display(global.display);
            else
                Meta.enable_unredirect_for_display(global.display);
        }
    } catch (e) {
        console.warn(`Manicule: unredirect toggle failed: ${e.message}`);
    }
}

export function scaleFactor() {
    return St.ThemeContext.get_for_stage(global.stage).scale_factor || 1;
}
