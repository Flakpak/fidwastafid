const SWATCHES = [
  { nom: "rouge", classe: "bg-rouge" },
  { nom: "rouge-clair", classe: "bg-rouge-clair" },
  { nom: "or", classe: "bg-or" },
  { nom: "orange", classe: "bg-orange" },
  { nom: "vert", classe: "bg-vert" },
  { nom: "bleu", classe: "bg-bleu" },
  { nom: "creme", classe: "bg-creme border border-bordure" },
  { nom: "sombre", classe: "bg-sombre" },
] as const;

export default function Home() {
  return (
    <main className="min-h-screen bg-creme text-texte p-10">
      <h1 className="font-arabic text-4xl text-rouge mb-2">فيدوستافيد</h1>
      <p className="text-muted font-semibold mb-8">
        Squelette Next.js 15 — charte rouge/or/crème (CONTRAT-V1 §8)
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {SWATCHES.map((s) => (
          <div key={s.nom} className="flex flex-col items-center gap-2">
            <div className={`h-20 w-full rounded-lg ${s.classe}`} />
            <span className="text-sm font-bold">{s.nom}</span>
          </div>
        ))}
      </div>
    </main>
  );
}
