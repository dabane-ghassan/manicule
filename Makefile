UUID    := manicule@dabane-ghassan.github.io
APP     := io.github.dabane_ghassan.Manicule
VERSION := $(shell sed -n 's/.*"version-name": *"\(.*\)".*/\1/p' extension/metadata.json)
DIST    := dist

.PHONY: all assets site install uninstall dist test clean

all: assets

# Regenerate the artwork, sounds and logo from the scripts in tools/.
assets:
	python3 tools/make_pointers.py
	python3 tools/make_sounds.py
	python3 tools/make_brand.py
	$(MAKE) site

# Copy what the website needs out of the app: the pointer drawings and the installer.
site:
	rm -rf docs/assets/pointers && mkdir -p docs/assets/pointers
	cp extension/assets/pointers/*.svg docs/assets/pointers/
	rm -f docs/assets/pointers/*.shadow.svg
	cp install.sh docs/install.sh
	touch docs/.nojekyll

install:
	sh install.sh

uninstall:
	sh install.sh --remove

# manicule.tar.gz: everything install.sh needs (what the curl installer downloads).
# manicule.shell-extension.zip: just the shell part, for `gnome-extensions install`.
dist:
	rm -rf $(DIST) && mkdir -p $(DIST)/manicule
	cp -R extension bin packaging install.sh LICENSE README.md $(DIST)/manicule/
	rm -f $(DIST)/manicule/extension/schemas/gschemas.compiled
	tar -C $(DIST) -czf $(DIST)/manicule.tar.gz manicule
	glib-compile-schemas $(DIST)/manicule/extension/schemas
	cd $(DIST)/manicule/extension && zip -qr ../../manicule.shell-extension.zip .
	rm -rf $(DIST)/manicule

# End-to-end tests in a headless GNOME Shell (see tests/README.md).
test:
	sh tests/run.sh

clean:
	rm -rf $(DIST) extension/schemas/gschemas.compiled
