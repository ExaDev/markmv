import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { type Application, JSX, RendererEvent } from "typedoc";

/** Where the card is published, relative to the site root. */
const SOCIAL_CARD_PATH = "media/social-card.png";
/** The committed card image the plugin copies into the site. */
const SOCIAL_CARD_SOURCE = "docs-src/media/social-card.png";
const SOCIAL_CARD_WIDTH = "1200";
const SOCIAL_CARD_HEIGHT = "630";

function hasDescription(value: unknown): value is { description: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "description" in value &&
    typeof value.description === "string"
  );
}

/**
 * Adds the Open Graph and Twitter card tags TypeDoc does not emit, so a shared link to any page of
 * the site unfurls with the project's card and description. Pages are only tagged when
 * `hostedBaseUrl` is set, since the card image and page URLs must be absolute.
 * @param app - The TypeDoc application the plugin is loaded into
 */
export function load(app: Application): void {
  const packageJson: unknown = JSON.parse(readFileSync("package.json", "utf8"));
  if (!hasDescription(packageJson)) {
    throw new Error("package.json is missing a string description field");
  }
  const { description } = packageJson;

  app.renderer.on(RendererEvent.END, (event) => {
    const target = join(event.outputDirectory, SOCIAL_CARD_PATH);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(SOCIAL_CARD_SOURCE, target);
  });

  app.renderer.hooks.on("head.end", (context) => {
    const hostedBaseUrl = app.options.getValue("hostedBaseUrl");
    if (hostedBaseUrl === "") return JSX.createElement(JSX.Fragment, null);

    const base = hostedBaseUrl.endsWith("/")
      ? hostedBaseUrl
      : `${hostedBaseUrl}/`;
    const projectName = context.page.project.name;
    const title =
      context.page.url === "index.html"
        ? projectName
        : `${context.page.model.name} | ${projectName}`;
    const tags: readonly (readonly [string, string, string])[] = [
      ["property", "og:type", "website"],
      ["property", "og:site_name", projectName],
      ["property", "og:title", title],
      ["property", "og:description", description],
      ["property", "og:url", `${base}${context.page.url}`],
      ["property", "og:image", `${base}${SOCIAL_CARD_PATH}`],
      ["property", "og:image:width", SOCIAL_CARD_WIDTH],
      ["property", "og:image:height", SOCIAL_CARD_HEIGHT],
      ["name", "twitter:card", "summary_large_image"],
    ];

    return JSX.createElement(
      JSX.Fragment,
      null,
      ...tags.map(([attribute, key, content]) =>
        JSX.createElement("meta", { [attribute]: key, content }),
      ),
    );
  });
}
