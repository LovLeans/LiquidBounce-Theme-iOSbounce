// Types for the plain-JS spring engine (spring.js), so TypeScript components can import it.
export interface Spring {
    p: number;
    v: number;
    t: number;
    k: number;
    c: number;
}

export function clamp(x: number, lo: number, hi: number): number;
export function spring(position: number, stiffness: number, damping: number): Spring;
export function retarget(s: Spring, target: number, stiffness?: number, damping?: number): void;
export function mixRgb(from: number[], to: number[], t: number): string;
export function createLoop(
    springs: Spring[],
    handlers: { render: () => void; onFrame?: () => void }
): { kick(): void; stop(): void };
