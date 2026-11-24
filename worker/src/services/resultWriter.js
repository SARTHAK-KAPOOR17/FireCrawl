import { Result } from '@scraper/shared';

export class ResultWriter {
  /**
   * @param {Object} [options]
   * @param {import('mongoose').Model} [options.ResultModel]
   * @param {number} [options.batchSize]
   * @param {number} [options.flushIntervalMs]
   */
  constructor({
    ResultModel = Result,
    batchSize = parseInt(process.env.BATCH_SIZE || '25', 10),
    flushIntervalMs = parseInt(process.env.FLUSH_INTERVAL_MS || '200', 10),
  } = {}) {
    this.ResultModel = ResultModel;
    this.batchSize = batchSize;
    this.flushIntervalMs = flushIntervalMs;
    this.buffer = [];
    this.timer = null;
  }

  /**
   * Adds a result document to the batch buffer.
   * Resolves to 'inserted' or 'duplicate' for that document.
   * @param {Object} resultDoc
   * @returns {Promise<'inserted'|'duplicate'>}
   */
  add(resultDoc) {
    return new Promise((resolve, reject) => {
      this.buffer.push({ doc: resultDoc, resolve, reject });

      if (this.buffer.length >= this.batchSize) {
        this.flush();
      } else if (!this.timer) {
        this.timer = setTimeout(() => {
          this.timer = null;
          this.flush();
        }, this.flushIntervalMs);
      }
    });
  }

  /**
   * Flushes currently buffered items using Result.insertMany with { ordered: false }
   */
  async flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (this.buffer.length === 0) {
      return;
    }

    const batch = this.buffer.splice(0, this.buffer.length);
    const docs = batch.map((item) => item.doc);

    try {
      await this.ResultModel.insertMany(docs, { ordered: false });
      for (const item of batch) {
        item.resolve('inserted');
      }
    } catch (err) {
      const isBulkError =
        err.name === 'MongoBulkWriteError' ||
        err.name === 'BulkWriteError' ||
        Array.isArray(err.writeErrors);

      if (isBulkError && Array.isArray(err.writeErrors)) {
        const errorByIndex = new Map();
        for (const we of err.writeErrors) {
          errorByIndex.set(we.index, we);
        }

        for (let i = 0; i < batch.length; i++) {
          const writeErr = errorByIndex.get(i);
          if (writeErr) {
            if (writeErr.code === 11000) {
              batch[i].resolve('duplicate');
            } else {
              batch[i].reject(writeErr);
            }
          } else {
            batch[i].resolve('inserted');
          }
        }
      } else if (err.code === 11000) {
        for (const item of batch) {
          item.resolve('duplicate');
        }
      } else {
        for (const item of batch) {
          item.reject(err);
        }
      }
    }
  }

  /**
   * Flushes remaining items on graceful shutdown
   */
  async shutdown() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.buffer.length > 0) {
      await this.flush();
    }
  }
}

let defaultWriter = null;

export function getResultWriter(options = {}) {
  if (!defaultWriter) {
    defaultWriter = new ResultWriter(options);
  }
  return defaultWriter;
}
