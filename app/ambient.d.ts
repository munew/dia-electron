import * as MonacoType from 'monaco-editor';

// Type-only-import
import { Root as AppType } from './renderer/app';

declare global {
  interface Window {
    MunewDIA: {
      app: AppType;
    };
    __REDUX_DEVTOOLS_EXTENSION_COMPOSE__: Function;
  }
  interface NodeModule{
    hot:any
  }
}