import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merges multiple class values into a single className string, handling conflicts intelligently.
 * Combines clsx for class composition with Tailwind CSS merge to resolve conflicting utilities.
 *
 * @param inputs - Variable number of class values (strings, objects, or arrays)
 * @returns A merged className string with resolved Tailwind CSS conflicts
 *
 * @example
 * cn('px-2', 'px-4') // Returns 'px-4' (conflict resolved)
 * cn({ 'text-red-500': true, 'text-blue-500': false }) // Returns 'text-red-500'
 * cn('flex', ['gap-2', 'gap-4']) // Returns 'flex gap-4'
 */
export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}
