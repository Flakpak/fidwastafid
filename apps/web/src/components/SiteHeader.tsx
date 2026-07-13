import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="bg-white border-b-2 border-bordure sticky top-0 z-10 px-4 py-3 flex items-center justify-between">
      <Link href="/" className="font-arabic text-2xl text-rouge">
        فيدوستافيد
      </Link>
      <nav className="flex items-center gap-4 text-sm font-bold">
        <Link href="/soumettre" className="text-muted hover:text-rouge">
          Proposer un bon plan
        </Link>
        <Link href="/connexion" className="text-muted hover:text-rouge">
          Connexion
        </Link>
      </nav>
    </header>
  );
}
