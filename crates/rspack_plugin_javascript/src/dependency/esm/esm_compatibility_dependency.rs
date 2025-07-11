use rspack_cacheable::{cacheable, cacheable_dyn};
use rspack_core::{
  DependencyCodeGeneration, DependencyTemplate, DependencyTemplateType, InitFragmentKey,
  InitFragmentStage, ModuleGraph, NormalInitFragment, PrefetchExportsInfoMode, RuntimeGlobals,
  TemplateContext, TemplateReplaceSource, UsageState,
};
use swc_core::atoms::Atom;

// Mark module `__esModule`.
// Add `__webpack_require__.r(__webpack_exports__);`.
#[cacheable]
#[derive(Debug, Clone)]
pub struct ESMCompatibilityDependency;

#[cacheable_dyn]
impl DependencyCodeGeneration for ESMCompatibilityDependency {
  fn dependency_template(&self) -> Option<DependencyTemplateType> {
    Some(ESMCompatibilityDependencyTemplate::template_type())
  }
}

#[cacheable]
#[derive(Debug, Default)]
pub struct ESMCompatibilityDependencyTemplate;

impl ESMCompatibilityDependencyTemplate {
  pub fn template_type() -> DependencyTemplateType {
    DependencyTemplateType::Custom("ESMCompatibilityDependency")
  }
}

impl DependencyTemplate for ESMCompatibilityDependencyTemplate {
  fn render(
    &self,
    _dep: &dyn DependencyCodeGeneration,
    _source: &mut TemplateReplaceSource,
    code_generatable_context: &mut TemplateContext,
  ) {
    let TemplateContext {
      runtime_requirements,
      init_fragments,
      compilation,
      module,
      runtime,
      concatenation_scope,
      ..
    } = code_generatable_context;
    if concatenation_scope.is_some() {
      return;
    }
    let module_graph = compilation.get_module_graph();
    let module = module_graph
      .module_by_identifier(&module.identifier())
      .expect("should have mgm");
    let name = Atom::from("__esModule");
    let exports_info = module_graph
      .get_prefetched_exports_info(&module.identifier(), PrefetchExportsInfoMode::Default);
    let used = exports_info
      .get_read_only_export_info(&name)
      .get_used(*runtime);
    if !matches!(used, UsageState::Unused) {
      runtime_requirements.insert(RuntimeGlobals::MAKE_NAMESPACE_OBJECT);
      runtime_requirements.insert(RuntimeGlobals::EXPORTS);
      init_fragments.push(Box::new(NormalInitFragment::new(
        format!(
          "{}({});\n",
          RuntimeGlobals::MAKE_NAMESPACE_OBJECT,
          module.get_exports_argument()
        ),
        InitFragmentStage::StageESMExports,
        0,
        InitFragmentKey::ESMCompatibility,
        None,
      )));
    }

    if ModuleGraph::is_async(compilation, &module.identifier()) {
      runtime_requirements.insert(RuntimeGlobals::MODULE);
      runtime_requirements.insert(RuntimeGlobals::ASYNC_MODULE);
      init_fragments.push(Box::new(NormalInitFragment::new(
        format!(
          "{}({}, async function (__webpack_handle_async_dependencies__, __webpack_async_result__) {{ try {{\n",
          RuntimeGlobals::ASYNC_MODULE,
          module_graph
            .module_by_identifier(&module.identifier())
            .expect("should have mgm")
            .get_module_argument()
        ),
        InitFragmentStage::StageAsyncBoundary,
        0,
        InitFragmentKey::unique(),
        Some(format!("\n__webpack_async_result__();\n}} catch(e) {{ __webpack_async_result__(e); }} }}{});", if module.build_meta().has_top_level_await { ", 1" } else { "" })),
      )));
    }
  }
}
