import fs from 'node:fs';
import path from 'node:path';
import type { Metadata } from 'next';

const homeDir = path.join(process.cwd(), 'src/app/_home');
const HOME_CSS = fs.readFileSync(path.join(homeDir, 'home.css'), 'utf8');
const HOME_HTML = fs.readFileSync(path.join(homeDir, 'home.html'), 'utf8');
const HOME_JS = fs.readFileSync(path.join(homeDir, 'home.js'), 'utf8');

export const metadata: Metadata = {
  title: 'doopla, toda carreira merece representação',
  description:
    'Um novo jeito de conectar artistas, bookers e agências e organizar tudo que acontece entre eles.',
};

export default function Home() {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link
        href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Familjen+Grotesk:ital,wght@0,400..700;1,400..700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap"
        rel="stylesheet"
      />
      <style>{HOME_CSS}</style>
      <div dangerouslySetInnerHTML={{ __html: HOME_HTML }} />
      <script dangerouslySetInnerHTML={{ __html: HOME_JS }} />
    </>
  );
}
