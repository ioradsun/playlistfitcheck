export class Container {
  children: any[] = [];
  position = { x: 0, y: 0, set: (x: number, y: number) => { this.position.x = x; this.position.y = y; } };
  pivot = { x: 0, y: 0, set: (x: number, y: number) => { this.pivot.x = x; this.pivot.y = y; } };
  visible = true;
  addChild<T>(child: T): T { this.children.push(child); return child; }
}

export class TextStyle {
  constructor(public options: Record<string, unknown>) {}
}

export class Text {
  alpha = 1;
  scale = { x: 1, y: 1, set: (x: number, y: number) => { this.scale.x = x; this.scale.y = y; } };
  visible = true;
  position = { x: 0, y: 0, set: (x: number, y: number) => { this.position.x = x; this.position.y = y; } };
  constructor(public text: string, public style: TextStyle) {}
}

export class Texture {
  static from(source: OffscreenCanvas | HTMLCanvasElement) {
    return new Texture(source);
  }
  constructor(public source: OffscreenCanvas | HTMLCanvasElement) {}
}

export class Sprite {
  position = { x: 0, y: 0, set: (x: number, y: number) => { this.position.x = x; this.position.y = y; } };
  width = 0;
  height = 0;
  constructor(public texture: Texture) {}
}

export class ParticleContainer extends Container {}

type InitOptions = {
  canvas: OffscreenCanvas;
  width: number;
  height: number;
  backgroundAlpha?: number;
};

export class Application {
  stage = new Container();
  renderer: { render: (stage: Container) => void };
  canvas!: OffscreenCanvas;
  width = 0;
  height = 0;
  private ctx!: OffscreenCanvasRenderingContext2D;

  constructor() {
    this.renderer = { render: (stage) => this.renderStage(stage) };
  }

  async init(options: InitOptions) {
    this.canvas = options.canvas;
    this.width = options.width;
    this.height = options.height;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("Unable to acquire 2D context for pixiLite");
    this.ctx = ctx;
  }

  private renderStage(stage: Container) {
    this.ctx.clearRect(0, 0, this.width, this.height);
    for (const node of stage.children) {
      if (node instanceof Sprite) {
        this.ctx.drawImage(node.texture.source, node.position.x, node.position.y, node.width || this.width, node.height || this.height);
      }
      if (node instanceof Container) {
        for (const child of node.children) {
          if (child instanceof Text && child.visible) {
            const fontSize = Number((child.style.options.fontSize as number) ?? 48);
            const family = String(child.style.options.fontFamily ?? "Montserrat");
            this.ctx.font = `${fontSize}px ${family}`;
            this.ctx.textAlign = "center";
            this.ctx.textBaseline = "middle";
            this.ctx.fillStyle = String(child.style.options.fill ?? "#ffffff");
            this.ctx.globalAlpha = child.alpha;
            this.ctx.fillText(
              child.text,
              child.position.x + stage.position.x - stage.pivot.x,
              child.position.y + stage.position.y - stage.pivot.y,
            );
            this.ctx.globalAlpha = 1;
          }
        }
      }
    }
  }

  destroy() {}
}
