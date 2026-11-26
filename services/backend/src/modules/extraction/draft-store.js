const fs = require('node:fs/promises');
const path = require('node:path');

class DraftStore {
  constructor(directory = process.env.US06_DRAFT_DIR || path.join(__dirname, 'data', 'drafts')) {
    this.directory = directory;
    this.queue = Promise.resolve();
  }

  async init() {
    await fs.mkdir(this.directory, { recursive: true });
  }

  resolveFile(id) {
    if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id)) {
      throw new Error('Invalid draft identifier');
    }
    return path.join(this.directory, `${id}.json`);
  }

  async create(draft) {
    await this.init();
    const file = this.resolveFile(draft.id);
    return this.serial(async () => {
      try {
        await fs.access(file);
        throw new Error('Draft already exists');
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      await this.writeAtomic(file, draft);
      return draft;
    });
  }

  async get(id) {
    try {
      return JSON.parse(await fs.readFile(this.resolveFile(id), 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }

  async list() {
    await this.init();
    const files = (await fs.readdir(this.directory))
      .filter((name) => /^[0-9a-f]{8}-[0-9a-f-]{27}\.json$/i.test(name));
    const records = await Promise.all(files.map(async (name) =>
      JSON.parse(await fs.readFile(path.join(this.directory, name), 'utf8'))));
    return records.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async update(draft) {
    await this.init();
    return this.serial(async () => {
      const file = this.resolveFile(draft.id);
      try {
        await fs.access(file);
      } catch (error) {
        if (error.code === 'ENOENT') throw new Error('Draft not found');
        throw error;
      }
      await this.writeAtomic(file, draft);
      return draft;
    });
  }

  async writeAtomic(file, value) {
    const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
    await fs.rename(temp, file);
  }

  serial(operation) {
    const result = this.queue.then(operation);
    this.queue = result.catch(() => {});
    return result;
  }
}

module.exports = DraftStore;
