# Nestwright privacy

Nestwright has no accounts, no analytics, and no ads. The game sends nothing over the internet on its own; the only connections it makes are co-op on your local network and Steam, both described below.

Projects, settings, achievement progress, and the onboarding flag stay on your computer, in browser storage inside the app. The app's data folder also holds the window position and crash logs in `logs/`. Those logs never leave the machine.

- Windows: `%APPDATA%\Nestwright`
- macOS: `~/Library/Application Support/Nestwright`
- Linux: `~/.config/Nestwright`

Co-op connects two computers directly on the same local network (port 47321). The project is sent only to the person who joined with the code.

Through Steam, and only when you launch the game from Steam, Steam receives achievement unlocks, stats, and a short rich-presence status line. Once Steam Cloud is enabled, Steam also receives the save files. That is covered by Valve's privacy policy: <https://store.steampowered.com/privacy_agreement/>

Deleting the app's data folder deletes everything stored locally.

Contact: Peixoto Labs. TODO(owner): contact email
