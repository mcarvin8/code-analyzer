import * as fs from 'node:fs';
import * as path from 'node:path';
import {ComponentSet, SourceComponent} from '@salesforce/source-deploy-retrieve';
import {getMessage, BundleName} from '../messages.js';

/**
 * Resolves the components listed in one or more package.xml manifests against the provided source paths, and returns
 * the absolute paths of every source file that backs those components (metadata XML files, content files, and the files
 * of any child components). Resolution is performed by @salesforce/source-deploy-retrieve, the same library used by
 * `sf project deploy start --manifest`, so the semantics (including wildcard members and .forceignore) match deploys.
 *
 * @param manifestPaths Paths to package.xml files.
 * @param resolveSourcePaths Paths (typically the workspace) against which the manifest's components are resolved.
 */
export async function resolveManifestTargets(manifestPaths: string[], resolveSourcePaths: string[]): Promise<string[]> {
	const resolvedFiles: Set<string> = new Set();
	for (const manifestPath of manifestPaths) {
		const absManifestPath: string = path.resolve(manifestPath);
		if (!fs.existsSync(absManifestPath) || !fs.statSync(absManifestPath).isFile()) {
			throw new Error(getMessage(BundleName.WorkspaceUtil, 'error.manifest-not-found', [manifestPath]));
		}

		let componentSet: ComponentSet;
		try {
			componentSet = await ComponentSet.fromManifest({
				manifestPath: absManifestPath,
				resolveSourcePaths: resolveSourcePaths.map(p => path.resolve(p))
			});
		} catch (err) {
			const reason: string = err instanceof Error ? err.message : String(err);
			throw new Error(getMessage(BundleName.WorkspaceUtil, 'error.manifest-unparseable', [manifestPath, reason]), {cause: err});
		}

		for (const component of componentSet.getSourceComponents()) {
			for (const file of collectComponentFiles(component)) {
				resolvedFiles.add(path.resolve(file));
			}
		}
	}
	return [...resolvedFiles].sort();
}

function collectComponentFiles(component: SourceComponent): string[] {
	const files: string[] = [];
	if (component.xml) {
		files.push(component.xml);
	}
	if (component.content) {
		files.push(...component.walkContent());
	}
	for (const child of component.getChildren()) {
		files.push(...collectComponentFiles(child));
	}
	return files;
}
