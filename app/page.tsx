import { redirect } from 'next/navigation';

/** The app opens on the inbox; the mail layout sends anyone signed out to /auth. */
export default function Home(): never {
  redirect('/inbox');
}
