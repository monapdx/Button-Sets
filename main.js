const { Plugin, PluginSettingTab, Setting, Modal, Notice } = require("obsidian");

const DEFAULTS = { iconFolder: "icons" };

module.exports = class CustomStyledButtonsPlugin extends Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULTS, await this.loadData());
    await this.ensureIconFolder();

    this.registerMarkdownCodeBlockProcessor("styled-button", (source, el) => {
      let config;
      try { config = JSON.parse(source.trim()); }
      catch (_) {
        el.createEl("div", { cls: "csb-error", text: "Styled button: invalid JSON" });
        return;
      }
      this.renderButton(config, el);
    });

    this.addCommand({
      id: "insert-custom-styled-button",
      name: "Insert custom styled button",
      editorCallback: (editor) => new ButtonBuilderModal(this.app, this, editor).open()
    });

    this.addSettingTab(new StyledButtonsSettingTab(this.app, this));
  }

  get pluginDir() { return `${this.manifest.dir}`; }
  get iconDir() { return `${this.pluginDir}/${this.settings.iconFolder}`; }

  async ensureIconFolder() {
    if (!(await this.app.vault.adapter.exists(this.iconDir))) {
      await this.app.vault.adapter.mkdir(this.iconDir);
    }
  }

  async listIcons() {
    await this.ensureIconFolder();
    const listing = await this.app.vault.adapter.list(this.iconDir);
    return listing.files.map(path => path.split("/").pop()).sort();
  }

  iconUrl(filename) {
    if (!filename) return "";
    return this.app.vault.adapter.getResourcePath(`${this.iconDir}/${filename}`);
  }

  renderButton(config, container) {
    const wrap = container.createDiv({ cls: "csb-wrap" });
    const button = wrap.createEl("button", { cls: `csb-button csb-${config.animation || "none"}` });
    button.style.setProperty("--csb-bg", config.background || "#7c3aed");
    button.style.setProperty("--csb-color", config.textColor || "#ffffff");
    button.style.setProperty("--csb-border", config.borderColor || config.background || "#7c3aed");
    button.style.setProperty("--csb-radius", `${Number(config.radius ?? 10)}px`);
    button.style.setProperty("--csb-size", `${Number(config.fontSize ?? 15)}px`);

    if (config.icon) {
      const img = button.createEl("img", { cls: "csb-icon", attr: { src: this.iconUrl(config.icon), alt: "" } });
      img.style.width = `${Number(config.iconSize ?? 24)}px`;
      img.style.height = `${Number(config.iconSize ?? 24)}px`;
    }
    button.createSpan({ text: config.label || "Button" });

    button.addEventListener("click", async () => {
      if (config.url) {
        window.open(config.url, config.url.startsWith("http") ? "_blank" : "_self");
      } else if (config.command) {
        const command = this.app.commands.findCommand(config.command);
        if (!command) return new Notice(`Command not found: ${config.command}`);
        this.app.commands.executeCommandById(config.command);
      } else {
        new Notice("This button has no action yet.");
      }
    });
  }
};

class ButtonBuilderModal extends Modal {
  constructor(app, plugin, editor) {
    super(app); this.plugin = plugin; this.editor = editor;
    this.value = { label: "New button", command: "", url: "", icon: "", background: "#7c3aed", textColor: "#ffffff", borderColor: "#7c3aed", radius: 10, fontSize: 17, iconSize: 40, animation: "none" };
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.addClass("csb-modal");
    contentEl.createEl("h2", { text: "Create styled button" });
    new Setting(contentEl).setName("Label").addText(c => c.setValue(this.value.label).onChange(v => this.value.label = v));
    new Setting(contentEl).setName("Command ID").setDesc("Use an Obsidian command ID, or leave blank if using a URL.").addText(c => c.setPlaceholder("app:open-settings").onChange(v => this.value.command = v.trim()));
    new Setting(contentEl).setName("URL").setDesc("Optional web or obsidian:// link.").addText(c => c.setPlaceholder("https://example.com").onChange(v => this.value.url = v.trim()));

    const icons = await this.plugin.listIcons();
    new Setting(contentEl).setName("Uploaded icon").addDropdown(c => {
      c.addOption("", "No icon"); icons.forEach(name => c.addOption(name, name));
      c.onChange(v => this.value.icon = v);
    });
    this.colorSetting(contentEl, "Background", "background");
    this.colorSetting(contentEl, "Text color", "textColor");
    this.colorSetting(contentEl, "Border color", "borderColor");
    new Setting(contentEl).setName("Corner radius").addSlider(c => c.setLimits(0, 30, 1).setValue(10).setDynamicTooltip().onChange(v => this.value.radius = v));
    new Setting(contentEl).setName("Text size").addSlider(c => c.setLimits(14, 28, 1).setValue(17).setDynamicTooltip().onChange(v => this.value.fontSize = v));
    new Setting(contentEl).setName("Icon size").addSlider(c => c.setLimits(32, 80, 2).setValue(40).setDynamicTooltip().onChange(v => this.value.iconSize = v));
    new Setting(contentEl).setName("Animation").addDropdown(c => c
      .addOptions({ none: "None", pulse: "Pulse", bounce: "Bounce", wiggle: "Wiggle", float: "Float", glow: "Glow" })
      .onChange(v => this.value.animation = v));

    new Setting(contentEl).addButton(c => c.setCta().setButtonText("Insert button").onClick(() => {
      const block = `\n\`\`\`styled-button\n${JSON.stringify(this.value, null, 2)}\n\`\`\`\n`;
      this.editor.replaceSelection(block);
      this.close();
    }));
  }

  colorSetting(el, name, key) {
    new Setting(el).setName(name).addColorPicker(c => c.setValue(this.value[key]).onChange(v => this.value[key] = v));
  }
  onClose() { this.contentEl.empty(); }
}

class StyledButtonsSettingTab extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
  display() {
    const { containerEl } = this; containerEl.empty();
    containerEl.createEl("h2", { text: "Custom Styled Buttons" });
    containerEl.createEl("p", { text: "Upload animated GIF, APNG, WebP, SVG, or ordinary image icons. Files stay inside this plugin's folder." });

    const setting = new Setting(containerEl).setName("Upload icon").setDesc("Choose an image from your computer.");
    const input = setting.controlEl.createEl("input", { attr: { type: "file", accept: "image/gif,image/apng,image/webp,image/png,image/svg+xml,image/jpeg" } });
    input.addEventListener("change", async () => {
      const file = input.files && input.files[0]; if (!file) return;
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      await this.plugin.ensureIconFolder();
      await this.app.vault.adapter.writeBinary(`${this.plugin.iconDir}/${safeName}`, await file.arrayBuffer());
      new Notice(`Uploaded ${safeName}`); this.display();
    });

    const list = containerEl.createDiv({ cls: "csb-icon-list" });
    this.plugin.listIcons().then(icons => {
      if (!icons.length) list.createEl("p", { text: "No icons uploaded yet." });
      icons.forEach(name => {
        const row = list.createDiv({ cls: "csb-icon-row" });
        row.createEl("img", { attr: { src: this.plugin.iconUrl(name), alt: "" } });
        row.createSpan({ text: name });
        const remove = row.createEl("button", { text: "Remove" });
        remove.addEventListener("click", async () => {
          await this.app.vault.adapter.remove(`${this.plugin.iconDir}/${name}`);
          new Notice(`Removed ${name}`); this.display();
        });
      });
    });
  }
}
