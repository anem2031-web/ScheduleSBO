import { useLanguage } from "@/lib/i18n";
import { productBrand } from "@shared/brand";

export function ProductBrand({ compact = false }: { compact?: boolean }) {
  const { language } = useLanguage();
  const brand = productBrand(language);
  return <div className={`product-brand ${compact ? "product-brand-compact" : ""}`} dir={brand.direction} lang={language === "ar" ? "ar" : "en"}>
    <p className="product-brand-name">{brand.name}</p>
    <p className="product-brand-description">{brand.description}</p>
  </div>;
}
