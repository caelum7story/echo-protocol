# 免费静态扫描与本地分诊

Slither 0.11.6 对精确 solc 0.8.38 / optimizer200 / Shanghai 编译结果运行102个检测器，涵盖43个合约（含依赖和测试夹具）；15个生产产物逐字节对齐当前artifact。显示结果排除依赖和test/mocks，未屏蔽任何检测器。共50条：4 High、8 Medium、29 Low、9 Informational。

四条高风险提示对应两条按原记账权益支付的提款，以及建池重入/LP余额检查。候选代码已有nonReentrant、提款先清余额、固定收款权益和固定DEX依赖；已有本地恶意收款/回调及实际DEX字节码测试。逐条理由和测试指针见 evidence/static-analysis-summary.json，原始结果完整保留。**这些是本地分诊，四条High尚无独立审查人签署结论，不能宣传通过安全审计。**

本次扫描未引入合约或经济规则变更。尚须独立检查固定外部依赖、视图中间状态、极端储备、长期价格操纵、完整权限与资金状态机。

复现：安装官方PyPI包slither-analyzer==0.11.6（建议隔离环境），执行 node scripts/export-static-analysis.mjs <新输出目录>；再执行 slither <新输出目录>/candidate_export.json --exclude-dependencies --filter-paths test/mocks --json <新结果.json>。非零发现退出码应保留，不能作为解析失败或被清除处理。具体工具来源/校验见本次工作目录tools/uv-download.json及tools/slither-package.json；工具二进制和环境不进入源码审查包。
