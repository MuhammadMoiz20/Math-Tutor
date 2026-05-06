import type { NextConfig } from "next";
import createMDX from "@next/mdx";

const nextConfig: NextConfig = {
  pageExtensions: ["ts", "tsx", "md", "mdx"],
};

// Plugins are passed by name so Turbopack can serialize loader options.
const withMDX = createMDX({
  options: {
    remarkPlugins: [["remark-math", {}]],
    rehypePlugins: [["rehype-katex", { strict: false }]],
  },
});

export default withMDX(nextConfig);
