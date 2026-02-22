import { useEffect } from "react";

type SeoHeadProps = {
  title: string;
  description: string;
  canonical: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  schema?: Record<string, unknown> | Array<Record<string, unknown>>;
};

const upsertMeta = (attr: "name" | "property", key: string, content: string) => {
  let node = document.head.querySelector(`meta[${attr}=\"${key}\"]`) as HTMLMetaElement | null;
  if (!node) {
    node = document.createElement("meta");
    node.setAttribute(attr, key);
    document.head.appendChild(node);
  }
  node.setAttribute("content", content);
};

export const SeoHead = ({
  title,
  description,
  canonical,
  ogTitle,
  ogDescription,
  ogImage,
  schema,
}: SeoHeadProps) => {
  useEffect(() => {
    document.title = title;
    upsertMeta("name", "description", description);
    upsertMeta("property", "og:title", ogTitle ?? title);
    upsertMeta("property", "og:description", ogDescription ?? description);
    upsertMeta("property", "og:url", canonical);
    if (ogImage) upsertMeta("property", "og:image", ogImage);
    upsertMeta("name", "twitter:card", "summary_large_image");
    upsertMeta("name", "twitter:title", ogTitle ?? title);
    upsertMeta("name", "twitter:description", ogDescription ?? description);
    if (ogImage) upsertMeta("name", "twitter:image", ogImage);

    let canonicalNode = document.head.querySelector("link[rel='canonical']") as HTMLLinkElement | null;
    if (!canonicalNode) {
      canonicalNode = document.createElement("link");
      canonicalNode.rel = "canonical";
      document.head.appendChild(canonicalNode);
    }
    canonicalNode.href = canonical;

    const scriptId = "seo-schema-jsonld";
    const existingScript = document.getElementById(scriptId);
    if (existingScript) {
      existingScript.remove();
    }

    if (schema) {
      const script = document.createElement("script");
      script.id = scriptId;
      script.type = "application/ld+json";
      script.textContent = JSON.stringify(schema);
      document.head.appendChild(script);
    }

    return () => {
      const current = document.getElementById(scriptId);
      if (current) current.remove();
    };
  }, [title, description, canonical, ogTitle, ogDescription, ogImage, schema]);

  return null;
};
