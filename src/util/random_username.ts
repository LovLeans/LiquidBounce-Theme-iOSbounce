// A random Minecraft username made on the spot, so every click on a "Random" button gives a new one.
//
// The client's own generator (`/client/account/random-name`) picks from a fixed list. This one builds a name out of
// random syllables and digits instead, so there is no list to run out of or repeat from. A name is 3 to 16 characters
// of [A-Za-z0-9_], which is what Minecraft accepts.

const MIN_LENGTH = 3;
const MAX_LENGTH = 16;

const ONSETS = [
    'b', 'c', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'm', 'n', 'p', 'r', 's', 't', 'v', 'w', 'z',
    'br', 'cr', 'dr', 'fl', 'gr', 'pl', 'sl', 'st', 'tr', 'sh', 'ch', 'th', 'kr', 'vr'
];
const VOWELS = ['a', 'e', 'i', 'o', 'u', 'a', 'e', 'i', 'o', 'u', 'ai', 'ea', 'ou', 'oo', 'ie'];
const CODAS = ['', '', '', '', 'n', 'r', 's', 'x', 'l', 'k', 'th', 'm', 'd'];
const CHARSET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_';

/** A random integer in [0, n). Uses the browser's crypto source when there is one. */
function below(n: number): number {
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        const buffer = new Uint32Array(1);
        crypto.getRandomValues(buffer);
        return buffer[0] % n;
    }

    return Math.floor(Math.random() * n);
}

const pick = <T>(list: readonly T[]): T => list[below(list.length)];
const chance = (percent: number) => below(100) < percent;
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Something that can be pronounced: 1 to `maxSyllables` syllables, e.g. "Atlas", "Bromeu", "kraxin". */
function word(maxSyllables: number): string {
    const syllables = 1 + below(maxSyllables);
    let result = '';
    for (let i = 0; i < syllables; i++) {
        // Only the first syllable may start with a vowel, and only the last one gets a coda.
        const onset = i === 0 && chance(15) ? '' : pick(ONSETS);
        result += onset + pick(VOWELS) + (i === syllables - 1 ? pick(CODAS) : '');
    }

    return result;
}

function digits(count: number): string {
    let result = '';
    for (let i = 0; i < count; i++) {
        result += below(10);
    }

    return result;
}

/** Any letters, digits and underscores at all: nothing about it is pronounceable. */
function scramble(length: number): string {
    let result = '';
    for (let i = 0; i < length; i++) {
        result += pick(CHARSET.split(''));
    }

    return result;
}

function build(): string {
    switch (below(6)) {
        case 0:
        case 1:
            // Atlas217836
            return capitalize(word(3)) + digits(1 + below(6));
        case 2:
            // BromeuKraxin
            return capitalize(word(2)) + capitalize(word(2)) + (chance(40) ? digits(1 + below(3)) : '');
        case 3:
            // vex_tolan_42
            return word(2) + '_' + word(2) + (chance(50) ? '_' + digits(1 + below(2)) : '');
        case 4:
            // kraxin
            return word(3) + (chance(50) ? digits(2 + below(3)) : '');
        default:
            // aG_7kQz2Pw
            return scramble(MIN_LENGTH + 3 + below(9));
    }
}

/** A new random username, 3 to 16 characters. Different on every call. */
export function generateUsername(): string {
    let name = build();

    if (name.length > MAX_LENGTH) {
        name = name.slice(0, MAX_LENGTH);
    }

    while (name.length < MIN_LENGTH) {
        name += below(10);
    }

    return name;
}
