import { test, expect } from "@playwright/test";

test("custom selects support keyboard, themed portals, settings persistence, and page creation", async ({
  page,
}) => {
  await page.goto("/");
  const sort = page.getByRole("combobox", {
    name: "Sort notebooks",
    exact: true,
  });
  await sort.focus();
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("option", { name: "Last edited", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("End");
  await expect(
    page.getByRole("option", { name: "Name A–Z", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(sort).toHaveText("Name A–Z");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const paper = page.getByRole("combobox", {
    name: "Default paper",
    exact: true,
  });
  await paper.click();
  await page.getByRole("option", { name: "Vintage", exact: true }).click();
  await expect(paper).toHaveText("Vintage");
  const zoom = page.getByRole("combobox", {
    name: "Starting zoom",
    exact: true,
  });
  await zoom.click();
  await page.getByRole("option", { name: "100%", exact: true }).click();
  for (const theme of ["Light", "Dark"]) {
    await page.getByRole("button", { name: theme, exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme",
      theme.toLowerCase(),
    );
    await paper.click();
    const options = page.getByRole("listbox");
    await expect(options).toBeVisible();
    const colors = await options.evaluate((element) => ({
      background: getComputedStyle(element).backgroundColor,
      color: getComputedStyle(element).color,
      surface: getComputedStyle(document.documentElement)
        .getPropertyValue("--surface")
        .trim(),
      text: getComputedStyle(document.documentElement)
        .getPropertyValue("--text")
        .trim(),
    }));
    // Resolve CSS variables through the browser so the portal must inherit the active theme.
    const expected = await page.evaluate(({ surface, text }) => {
      const probe = document.createElement("div");
      probe.style.backgroundColor = surface;
      probe.style.color = text;
      document.body.append(probe);
      const result = {
        background: getComputedStyle(probe).backgroundColor,
        color: getComputedStyle(probe).color,
      };
      probe.remove();
      return result;
    }, colors);
    expect(colors.background).toBe(expected.background);
    expect(colors.color).toBe(expected.color);
    await expect(
      page.getByRole("option", { name: "Vintage", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await page.screenshot({
      path: `test-results/select-${theme.toLowerCase()}.png`,
    });
    await page.keyboard.press("Escape");
    await expect(paper).toBeFocused();
  }
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(paper).toHaveText("Vintage");
  await expect(zoom).toHaveText("100%");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page
    .getByRole("button", { name: "Open My Journal", exact: true })
    .click();
  await expect(page.locator(".excalidraw canvas").first()).toBeVisible();
  await page.getByRole("button", { name: "New page", exact: true }).click();
  await page.getByRole("combobox", { name: "Paper size", exact: true }).click();
  await page.getByRole("option", { name: "A5", exact: true }).click();
  await page.getByRole("button", { name: "Create page", exact: true }).click();
  await expect(
    page.getByText("A5 · vintage paper", { exact: true }),
  ).toBeVisible();
  for (const theme of ["dark", "light"]) {
    if ((await page.locator("html").getAttribute("data-theme")) !== theme)
      await page
        .getByRole("button", { name: "Toggle theme", exact: true })
        .click();
    const exportButton = page.getByRole("button", {
      name: "Export page",
      exact: true,
    });
    await exportButton.click();
    await expect(
      page.getByRole("menuitem", { name: "PNG image", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("menu")).toHaveCSS(
      "background-color",
      theme === "dark" ? "rgb(45, 43, 51)" : "rgb(255, 254, 250)",
    );
    await page.screenshot({ path: `test-results/export-${theme}.png` });
    await page.keyboard.press("Escape");
    await expect(exportButton).toBeFocused();
  }
});

test.describe("touch dropdowns", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test("export menu fits small screens and supports repeated exports by tap", async ({
    page,
  }) => {
    await page.goto("/");
    await page
      .getByRole("button", { name: "Open My Journal", exact: true })
      .tap();
    await expect(page.locator(".excalidraw canvas").first()).toBeVisible();
    for (let index = 0; index < 2; index++) {
      await page
        .getByRole("button", { name: "Export page", exact: true })
        .tap();
      const menu = page.getByRole("menu");
      const bounds = await menu.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
      const download = page.waitForEvent("download");
      await page
        .getByRole("menuitem", { name: "PNG image", exact: true })
        .tap();
      expect((await download).suggestedFilename()).toMatch(/\.png$/);
      await expect(menu).toHaveCount(0);
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(390);
  });
});
