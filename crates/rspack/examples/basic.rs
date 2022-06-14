use std::{collections::HashMap, path::Path};

use rspack_core::{log, Compiler, CompilerOptions};
use sugar_path::PathSugar;

#[tokio::main]
async fn main() {
  let guard = log::enable_tracing_by_env_with_chrome_layer();
  let mut compiler = Compiler::new(
    CompilerOptions {
      entries: HashMap::from([("main".to_string(), "./src/index.js".to_string().into())]),
      root: Path::new("./examples/react")
        .resolve()
        .to_string_lossy()
        .to_string(),
      ..Default::default()
    },
    vec![
      Box::new(rspack_plugin_javascript::JsPlugin {}),
      Box::new(rspack_plugin_css::CssPlugin::default()),
    ],
  );

  compiler.run().await.unwrap();

  if let Some(g) = guard {
    g.flush()
  }
}
