import * as path from "path";
import { startServer, stopServer } from "../agents-headless/server.js";
import logger from "../utils/logger";
import { getAvailablePort } from "../utils/index";
import { IpcEvents, BROWSER_WINDOW_EVENTS } from "../ipc-events";
import { ipcMainManager } from "./ipc";
import {
  getHeadlessAgentPreferencesJSON,
  updateHeadlessAgentPreferencesJSON,
} from "./preferences";

import { HeadlessAgentPreference } from "../interfaces";

let _headlessAgent: HeadlessAgent;

class HeadlessAgent {
  public port: number = 8090;
  // in the middle of start agent
  public starting: boolean = false;
  // in the middle of stop agent
  public stopping: boolean = false;
  // agent is running
  public running: boolean = false;
  constructor() {}

  getConfig(): HeadlessAgentPreference {
    try {
      let config = getHeadlessAgentPreferencesJSON();
      config.PORT = this.port;
      config.RUNNING = this.running;
      config.STARTING = this.starting;
      config.STOPPING = this.stopping;
      return config;
    } catch (err) {
      logger.error("HeadlessAgent -> getConfig fail. ", err);
      throw err;
    }
  }

  setConfig(agentConfig: HeadlessAgentPreference) {
    try {
      return updateHeadlessAgentPreferencesJSON(agentConfig);
    } catch (err) {
      logger.error("setConfig -> getConfig fail. ", err);
      throw err;
    }
  }

  public async start() {
    try {
      // -------------------------------
      // update runtime configs
      this.starting = true;
      this.running = false;
      this.stopping = false;

      // notify engine-ui
      ipcMainManager.send(IpcEvents.MESSAGE_TO_ENGINE_UI, [
        {
          subject: BROWSER_WINDOW_EVENTS.STARTING_HEADLESS,
          data: this.getConfig(),
        },
      ]);

      const headlessConfig = this.getConfig();
      this.port = await getAvailablePort(this.port);
      const headlessHome = headlessConfig.AGENT_HOME;
      const logPath = path.join(headlessHome, "log");
      logger.info(`headless agent port: ${this.port} `);
      const configs = {
        PORT: this.port,
        MUNEW_BASE_URL: headlessConfig.MUNEW_BASE_URL,
        GLOBAL_ID: headlessConfig.GLOBAL_ID,
        HEADLESS: false,
        LOG_FILES_PATH: logPath,
        SERVICE_NAME: "agents-headless",
        SCREENSHOT: true,
        AGENT_HOME: headlessHome,
      };
      const expressOptions = {
        static: headlessHome,
      };
      const indexOptions = {
        home: headlessHome,
        items: [
          undefined,
          undefined,
          undefined,
          {
            url: "/screenshots",
            title: "Screenshots",
            description: "Screenshots of web page",
          },
        ],
      };

      // TODO: need to remove
      // Only for test purpose
      await new Promise((resolve) => {
        setTimeout(() => resolve(true), 10 * 1000);
      });

      await startServer(configs, expressOptions, indexOptions);

      // -------------------------------
      // update runtime configs
      this.starting = false;
      this.running = true;
      this.stopping = false;

      // notify engine-ui
      ipcMainManager.send(IpcEvents.MESSAGE_TO_ENGINE_UI, [
        {
          subject: BROWSER_WINDOW_EVENTS.STARTED_HEADLESS,
          status: true,
          data: this.getConfig(),
          error: null,
        },
      ]);
    } catch (err) {
      // -------------------------------
      // update runtime configs
      this.starting = false;
      this.running = false;
      this.stopping = false;

      // notify engine-ui
      ipcMainManager.send(IpcEvents.MESSAGE_TO_ENGINE_UI, [
        {
          subject: BROWSER_WINDOW_EVENTS.STARTED_HEADLESS,
          status: false,
          data: this.getConfig(),
          error: err,
        },
      ]);
      throw err;
    }
  }

  public async restart() {
    try {
      this.stop();
      this.start();
    } catch (err) {
      throw err;
    }
  }

  public async stop() {
    try {
      // -------------------------------
      // update runtime configs
      this.starting = false;
      this.stopping = true;

      // notify engine-ui
      ipcMainManager.send(IpcEvents.MESSAGE_TO_ENGINE_UI, [
        {
          subject: BROWSER_WINDOW_EVENTS.STOPPING_HEADLESS,
          data: this.getConfig(),
        },
      ]);

      // TODO: need to remove
      // Only for test purpose
      await new Promise((resolve) => {
        setTimeout(() => resolve(true), 10 * 1000);
      });

      await stopServer();
      // -------------------------------
      // update runtime configs
      this.starting = false;
      this.running = false;
      this.stopping = false;

      // notify engine-ui
      ipcMainManager.send(IpcEvents.MESSAGE_TO_ENGINE_UI, [
        {
          subject: BROWSER_WINDOW_EVENTS.STOPPED_HEADLESS,
          status: true,
          data: this.getConfig(),
          error: null,
        },
      ]);
    } catch (err) {
      // -------------------------------
      // update runtime configs
      this.starting = false;
      this.stopping = false;

      // notify engine-ui
      ipcMainManager.send(IpcEvents.MESSAGE_TO_ENGINE_UI, [
        {
          subject: BROWSER_WINDOW_EVENTS.STOPPED_HEADLESS,
          status: false,
          data: this.getConfig(),
          error: err,
        },
      ]);
      throw err;
    }
  }
}

export function setupHeadlessAgent(): HeadlessAgent {
  try {
    if (_headlessAgent) {
      return _headlessAgent;
    }
    _headlessAgent = new HeadlessAgent();
    _headlessAgent.start();

    // setup message listener
    ipcMainManager.on(IpcEvents.SYNC_ENGINE_UI_TO_MAIN, async (event, body) => {
      const subject = body && body.subject;
      console.log("subject: ", subject);
      switch (subject) {
        case "getHeadlessConfig":
          event.returnValue = {
            status: true,
            data: _headlessAgent.getConfig(),
          };
          break;
        case "headless/start":
          let startValue = {
            status: false,
            error: null,
          };
          try {
            _headlessAgent.start();
            startValue.status = true;
          } catch (err) {
            startValue.status = false;
            startValue.error = err;
          }

          event.returnValue = startValue;
          console.log("headless/start -> returnValue: ", startValue);
          break;
        case "headless/stop":
          let stopValue = {
            status: false,
            data: {},
            error: null,
          };
          try {
            _headlessAgent.stop();
            stopValue.status = true;
          } catch (err) {
            stopValue.status = false;
            stopValue.error = err;
          }

          event.returnValue = stopValue;
          console.log("headless/stop -> returnValue: ", stopValue);
          break;
        // default:
        //   console.log("default subject ");
        //   event.returnValue = {
        //     status: false,
        //     error: {
        //       message:
        //         "not matched subject. Please pass one of ['getHeadlessConfig', 'updateHeadlessConfig', 'startHeadless', 'stopHeadless']",
        //     },
        //   };
      }
    });

    return _headlessAgent;
  } catch (err) {
    logger.error("setupHeadlessAgent fail.", err);
    throw err;
  }
}
