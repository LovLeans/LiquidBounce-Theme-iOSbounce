// Fonts of the lock-screen clock (see FT in routes/menu/title/main-menu/lockscreen.svelte.ts).
//
// Each family is a VARIABLE font from the @fontsource-variable packages (SIL Open Font License, free to ship), so the
// weight slider in the clock editor moves smoothly through the whole range and every weight really looks different.
// Vite copies the font files into the build; nothing is downloaded from the internet at run time, and a face is only
// read from disk when something is first drawn with it.
//
// Install once:
//   npm i @fontsource-variable/inter @fontsource-variable/oswald @fontsource-variable/nunito @fontsource-variable/source-serif-4 \
//         @fontsource-variable/jetbrains-mono @fontsource-variable/outfit @fontsource-variable/unbounded \
//         @fontsource-variable/big-shoulders-display @fontsource-variable/fraunces @fontsource-variable/orbitron \
//         @fontsource-variable/space-grotesk @fontsource-variable/roboto-slab @fontsource-variable/caveat \
//         @fontsource-variable/antonio @fontsource-variable/dancing-script
import '@fontsource-variable/inter'; // sans (replaces SF Pro in the clock)
import '@fontsource-variable/oswald'; // cond
import '@fontsource-variable/nunito'; // rounded
import '@fontsource-variable/source-serif-4'; // serif
import '@fontsource-variable/jetbrains-mono'; // mono
import '@fontsource-variable/outfit'; // geo
import '@fontsource-variable/unbounded'; // wide
import '@fontsource-variable/big-shoulders-display'; // tall
import '@fontsource-variable/fraunces'; // soft
import '@fontsource-variable/orbitron'; // tech
import '@fontsource-variable/space-grotesk'; // grot
import '@fontsource-variable/roboto-slab'; // slab
import '@fontsource-variable/caveat'; // hand
import '@fontsource-variable/antonio'; // narrow (replaces Bebas Neue)
import '@fontsource-variable/dancing-script'; // script (replaces Pacifico)
