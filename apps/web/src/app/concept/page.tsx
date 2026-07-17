import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "../../components/SiteHeader.js";
import { SiteFooter } from "../../components/SiteFooter.js";

const DESCRIPTION =
  "Fidwastafid est une plateforme communautaire 100% marocaine de bons plans, promotions et bonnes affaires : chaque Marocain qui trouve une bonne promo la partage avec la communauté.";

export const metadata: Metadata = {
  title: "Le concept",
  description: DESCRIPTION,
  alternates: { canonical: "/concept" },
  openGraph: { title: "Le concept Fidwastafid", description: DESCRIPTION, url: "/concept" },
};

const STATS = [
  { icon: "🔥", num: "100%", label: "Gratuit" },
  { icon: "🏪", num: "+50", label: "Enseignes" },
  { icon: "🇲🇦", num: "+20", label: "Villes" },
];

const ETAPES = [
  {
    num: 1,
    fr: "Tu trouves une لهميزة",
    ar: "لقيتي لهميزة ديالك",
    desc: "En faisant tes courses en magasin ou en ligne. Si ça t'a fait économiser, ça peut faire économiser tout le monde.",
    descAr: "وانت كتدير مشترياتك فالحانوت أو فالنت. إلا وفرتي، يمكن كل الناس توفر.",
  },
  {
    num: 2,
    fr: "Tu la partages en 30 sec",
    ar: "شاركيها مع الجماعة",
    desc: "Prix, magasin, ville — notre équipe vérifie et publie. Tu construis ta réputation de chasseur de bons plans.",
    descAr: "الثمن، الحانوت، المدينة — الفريق ديالنا كيتحقق وكينشر. كتبني سمعتك بحال الخبير فلهميزات.",
  },
  {
    num: 3,
    fr: "La communauté vote",
    ar: "الجماعة تقيّم",
    desc: "ربح = deal intéressant, fonce. خسارة = à éviter. Les meilleures لهميزات remontent en tête automatiquement.",
    descAr: "ربح = لهميزة مزيانة، سير. خسارة = خليها. لهميزات الأحسن كاتصعد لفوق بشكل أوتوماتيكي.",
  },
];

/** Bloc titre de section — porté depuis ConceptPage/Section (index.html racine, v1). */
function Section({
  label,
  titreFr,
  titreAr,
  children,
}: {
  label: string;
  titreFr: string;
  titreAr?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-11">
      <p className="text-[10px] font-extrabold tracking-[2px] uppercase text-rouge mb-1.5">{label}</p>
      <h2 className="text-xl md:text-[22px] font-black leading-tight mb-1">{titreFr}</h2>
      {titreAr && (
        <p dir="rtl" className="font-arabic text-orange text-lg mb-4">
          {titreAr}
        </p>
      )}
      {children}
    </div>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-[#5a4a3a] font-semibold leading-relaxed mb-2.5">{children}</p>;
}

function PAr({ children }: { children: React.ReactNode }) {
  return (
    <p dir="rtl" className="font-arabic text-[#8a7560] text-lg leading-loose mb-2.5">
      {children}
    </p>
  );
}

export default function ConceptPage() {
  return (
    <div className="min-h-screen bg-creme text-texte">
      <SiteHeader />
      <main className="max-w-3xl mx-auto px-6 py-10 md:py-14">
        {/* Hero — porté depuis ConceptPage (index.html racine, v1). */}
        <div className="relative overflow-hidden bg-sombre rounded-2xl px-9 py-10 text-center mb-12">
          <p dir="rtl" className="font-arabic text-orange text-4xl md:text-5xl leading-tight mb-2">
            فيدوستافيد
          </p>
          <p className="text-sm text-white/55 font-semibold mb-1.5">Fidwastafid — بون بلان ديالك، فيدة للجماعة</p>
          <p dir="rtl" className="font-arabic text-white/40 text-lg">
            شارك لهميزات ديالك و خلي غيرك يستافيد
          </p>
        </div>

        <Section
          label="Le concept"
          titreFr="Les bons plans du Maroc, par les Marocains"
          titreAr="لهميزات ديال المغرب، من عند المغاربة"
        >
          <P>
            Fidwastafid est une plateforme communautaire 100% marocaine dédiée aux bons plans, promotions et bonnes
            affaires au Maroc. L&apos;idée est simple : chaque Marocain qui trouve une bonne promo la partage avec
            toute la communauté.
          </P>
          <P>
            Que ce soit chez Marjane, BIM, Carrefour, Jumia ou dans n&apos;importe quelle boutique de ton quartier —
            si tu as trouvé <strong>لهميزة</strong>, partage-la !
          </P>
          <PAr>
            فيدوستافيد هي منصة مجتمعية مغربية 100% للبون بلان والعروض والتخفيضات فالمغرب. الفكرة بسيطة: كل مغربي لي
            لقا عرض مزيان يشاركو مع الجماعة.
          </PAr>
          <PAr>سواء عند مرجان، بيم، كارفور، جوميا ولا فأي حانوت فحيك — إلا لقيتي لهميزة، شاركيها!</PAr>
        </Section>

        <div className="grid grid-cols-3 gap-3.5 mb-11">
          {STATS.map((s) => (
            <div key={s.label} className="bg-white border border-bordure rounded-2xl px-3.5 py-4.5 text-center">
              <p className="text-xl mb-1.5">{s.icon}</p>
              <p className="text-2xl font-black text-rouge mb-1">{s.num}</p>
              <p className="text-[10px] font-extrabold text-muted uppercase tracking-wide">{s.label}</p>
            </div>
          ))}
        </div>

        <Section
          label="Nos valeurs"
          titreFr="فيد و ستافيد — Partage et fais profiter"
          titreAr="التعاون والمشاركة هما روح المنصة"
        >
          <P>
            Fidwastafid est construit sur un principe simple emprunté à la sagesse marocaine :{" "}
            <strong>ce qui profite à un seul peut profiter à tous</strong>. Chaque deal partagé, c&apos;est une
            famille qui économise sur ses courses, un étudiant qui trouve le bon smartphone moins cher, une mère qui
            gère mieux son budget.
          </P>
          <PAr>
            فيدوستافيد مبنية على مبدأ بسيط من الحكمة المغربية: اللي ينفع واحد يمكن ينفع الجميع. كل لهميزة كتشاركيها،
            كاين عايلة توفر فالمشتريات، كاين طالب لقا الهاتف بثمن أرخص، كاين ماما تدبر ميزانيتها بشكل أحسن.
          </PAr>
          <div className="bg-white border-l-4 border-l-rouge rounded-r-xl px-5 py-4 my-5">
            <p className="italic text-[15px] font-bold mb-1.5">
              &quot;Les meilleures لهميزات sont celles qu&apos;on partage&quot;
            </p>
            <p dir="rtl" className="font-arabic text-orange text-lg">
              لهميزة المزيانة هي اللي كتشاركيها 🔥
            </p>
          </div>
        </Section>

        <Section label="Comment ça marche" titreFr="Simple comme bonjour" titreAr="بساطة كاملة">
          {ETAPES.map((step) => (
            <div key={step.num} className="flex gap-4 bg-white border border-bordure rounded-2xl p-4.5 mb-3">
              <span className="w-[38px] h-[38px] shrink-0 rounded-[10px] bg-rouge text-white flex items-center justify-center text-lg font-black">
                {step.num}
              </span>
              <div className="flex-1">
                <p className="text-sm font-extrabold mb-0.5">
                  {step.fr} —{" "}
                  <span dir="rtl" className="font-arabic text-rouge text-base">
                    {step.ar}
                  </span>
                </p>
                <p className="text-xs text-muted font-semibold leading-relaxed mb-1">{step.desc}</p>
                <p dir="rtl" className="font-arabic text-[#aaa] text-sm leading-relaxed">
                  {step.descAr}
                </p>
              </div>
            </div>
          ))}
        </Section>

        <div className="bg-sombre rounded-2xl px-8 py-7 text-center">
          <p dir="rtl" className="font-arabic text-orange text-2xl mb-2">
            فيد و ستافيد 🔥
          </p>
          <p className="text-sm text-white/60 font-semibold mb-5">
            Rejoins la communauté et partage ta première لهميزة !
          </p>
          <Link href="/" className="inline-block bg-rouge text-white rounded-xl px-8 py-3 text-sm font-black">
            Voir les deals →
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
