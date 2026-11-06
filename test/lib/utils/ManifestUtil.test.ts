import * as path from 'node:path';
import {CodeAnalyzer, CodeAnalyzerConfig, Workspace} from '@salesforce/code-analyzer-core';
import {resolveManifestTargets} from '../../../src/lib/utils/ManifestUtil.js';
import * as WorkspaceUtil from '../../../src/lib/utils/WorkspaceUtil.js';

const PATH_TO_WORKSPACE = path.join(import.meta.dirname, '..', '..', 'fixtures', 'example-workspaces', 'workspace-with-manifest');
const CLASSES = path.join(PATH_TO_WORKSPACE, 'force-app', 'main', 'default', 'classes');
const LWC = path.join(PATH_TO_WORKSPACE, 'force-app', 'main', 'default', 'lwc', 'myCmp');
const MANIFESTS = path.join(PATH_TO_WORKSPACE, 'manifest');

const CHANGED_CLASS_FILES = [
	path.join(CLASSES, 'ChangedClass.cls'),
	path.join(CLASSES, 'ChangedClass.cls-meta.xml')
];
const UNCHANGED_CLASS_FILES = [
	path.join(CLASSES, 'UnchangedClass.cls'),
	path.join(CLASSES, 'UnchangedClass.cls-meta.xml')
];
const LWC_FILES = [
	path.join(LWC, 'myCmp.html'),
	path.join(LWC, 'myCmp.js'),
	path.join(LWC, 'myCmp.js-meta.xml')
];

describe('ManifestUtil', () => {
	const ORIGINAL_TEST_DIR = process.cwd();

	beforeEach(() => {
		process.chdir(PATH_TO_WORKSPACE);
	});

	afterEach(() => {
		process.chdir(ORIGINAL_TEST_DIR);
	});

	describe('#resolveManifestTargets()', () => {
		it('Resolves every source file of each listed component, including whole bundles', async () => {
			const files = await resolveManifestTargets([path.join('manifest', 'package.xml')], ['.']);

			expect(files).toEqual([...CHANGED_CLASS_FILES, ...LWC_FILES].sort());
		});

		it('Resolves wildcard members to every component of that type in the source paths', async () => {
			const files = await resolveManifestTargets([path.join(MANIFESTS, 'wildcard-package.xml')], [PATH_TO_WORKSPACE]);

			expect(files).toEqual([...CHANGED_CLASS_FILES, ...UNCHANGED_CLASS_FILES].sort());
		});

		it('Unions and de-duplicates the files from multiple manifests', async () => {
			const files = await resolveManifestTargets([
				path.join(MANIFESTS, 'package.xml'),
				path.join(MANIFESTS, 'wildcard-package.xml')
			], ['.']);

			expect(files).toEqual([...CHANGED_CLASS_FILES, ...UNCHANGED_CLASS_FILES, ...LWC_FILES].sort());
		});

		it('Only resolves components that live within the provided source paths', async () => {
			const files = await resolveManifestTargets([path.join(MANIFESTS, 'package.xml')], [CLASSES]);

			expect(files).toEqual(CHANGED_CLASS_FILES.sort());
		});

		it('Returns no files when none of the listed components exist', async () => {
			const files = await resolveManifestTargets([path.join(MANIFESTS, 'missing-package.xml')], ['.']);

			expect(files).toEqual([]);
		});

		it('Throws a helpful error when the manifest does not exist', async () => {
			await expect(resolveManifestTargets(['nope.xml'], ['.'])).rejects.toThrow('Target manifest nope.xml does not exist or is not a file.');
		});

		it('Throws a helpful error when the manifest cannot be parsed', async () => {
			const manifest = path.join('manifest', 'invalid-package.xml');
			await expect(resolveManifestTargets([manifest], ['.'])).rejects.toThrow(`Target manifest ${manifest} could not be resolved:`);
		});
	});

	describe('Integration with WorkspaceUtil#createWorkspace()', () => {
		function createCore(): CodeAnalyzer {
			return new CodeAnalyzer(CodeAnalyzerConfig.withDefaults());
		}

		it('Keeps the whole workspace while targeting only the manifest components', async () => {
			const workspace: Workspace = await WorkspaceUtil.createWorkspace(createCore(), ['.'], undefined, [path.join('manifest', 'package.xml')]);

			expect(workspace.getRawFilesAndFolders()).toEqual([PATH_TO_WORKSPACE]);
			expect([...(workspace.getRawTargets() ?? [])].sort()).toEqual([...CHANGED_CLASS_FILES, ...LWC_FILES].sort());
		});

		it('Unions --target paths with manifest targets', async () => {
			const extraTarget = path.join('force-app', 'main', 'default', 'classes', 'UnchangedClass.cls');
			const workspace: Workspace = await WorkspaceUtil.createWorkspace(createCore(), ['.'], [extraTarget], [path.join('manifest', 'package.xml')]);

			expect([...(workspace.getRawTargets() ?? [])].sort())
				.toEqual([...CHANGED_CLASS_FILES, ...LWC_FILES, path.join(CLASSES, 'UnchangedClass.cls')].sort());
		});

		it('Throws rather than silently targeting the entire workspace when the manifest resolves to no files', async () => {
			await expect(WorkspaceUtil.createWorkspace(createCore(), ['.'], undefined, [path.join('manifest', 'missing-package.xml')]))
				.rejects.toThrow('None of the components listed in target manifest(s)');
		});

		it('Still uses --target paths alone when the manifest resolves to no files', async () => {
			const extraTarget = path.join('force-app', 'main', 'default', 'classes', 'UnchangedClass.cls');
			const workspace: Workspace = await WorkspaceUtil.createWorkspace(createCore(), ['.'], [extraTarget], [path.join('manifest', 'missing-package.xml')]);

			expect(workspace.getRawTargets()).toEqual([path.join(CLASSES, 'UnchangedClass.cls')]);
		});
	});
});
