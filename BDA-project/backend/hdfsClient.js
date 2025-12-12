const axios = require('axios');

class HdfsClient {
  constructor({ host, user }) {
    this.host = host.replace(/\/$/, '');
    this.user = user || 'root';
  }

  async ensureDir(path) {
    const url = `${this.host}/webhdfs/v1${path}?op=MKDIRS&user.name=root`;
    try {
      const res = await axios.put(url, null, { maxRedirects: 0, validateStatus: s => s >= 200 && s < 400, timeout: 5000 });
      return res.data;
    } catch (err) {
      return null;
    }
  }

  async writeFile(path, data) {
    const dir = path.substring(0, path.lastIndexOf('/')) || '/';
    await this.ensureDir(dir);

    const createUrl = `${this.host}/webhdfs/v1${path}?op=CREATE&overwrite=true&user.name=root&noredirect=true`;
    try {
      await axios.put(createUrl, data, {
        headers: { 'Content-Type': 'application/octet-stream' },
        timeout: 5000,
        maxRedirects: 0,
        validateStatus: s => s >= 200 && s < 500
      });
      return true;
    } catch (err) {
      throw new Error(`Failed to write file: ${err.message}`);
    }
  }

  async readFile(path) {
    const openUrl = `${this.host}/webhdfs/v1${path}?op=OPEN&user.name=root&noredirect=true`;
    try {
      const res = await axios.get(openUrl, {
        responseType: 'text',
        timeout: 5000,
        maxRedirects: 0,
        validateStatus: s => s >= 200 && s < 500
      });
      if (res.status >= 200 && res.status < 300) {
        return res.data;
      }
      const r1 = await axios.get(openUrl.replace('&noredirect=true', ''), {
        maxRedirects: 0,
        validateStatus: s => s === 307,
        timeout: 5000
      });
      const location = r1.headers.location;
      if (!location) throw new Error('No redirect location for open');
      const res2 = await axios.get(location, { responseType: 'text', timeout: 5000 });
      return res2.data;
    } catch (err) {
      if (err.response && err.response.status === 404) return null;
      throw new Error(`Failed to read file at ${path}: ${err.message}`);
    }
  }
}

module.exports = HdfsClient;
