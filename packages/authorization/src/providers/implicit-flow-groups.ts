import createDebug from 'debug';

import { VKError } from 'vk-io';

import { URL, URLSearchParams } from 'url';

import { ImplicitFlow, IImplicitFlowOptions } from './implicit-flow';

import { Response } from '../fetch-cookie';
import { AuthorizationError } from '../errors';
import { getGroupsPermissionsByName } from '../helpers';
import { CALLBACK_BLANK, AuthErrorCode } from '../constants';

const debug = createDebug('vk-io:authorization:implicit-flow-user');

const { AUTHORIZATION_FAILED } = AuthErrorCode;

export interface IImplicitFlowGroupsOptions extends IImplicitFlowOptions {
	groupIds: number[];
}

export class ImplicitFlowGroups extends ImplicitFlow {
	groupIds: number[];

	/**
	 * Constructor
	 */
	constructor(options: IImplicitFlowGroupsOptions) {
		super(options);

		let { groupIds } = options;

		if (!Array.isArray(groupIds)) {
			groupIds = [groupIds];
		}

		this.groupIds = groupIds.map((rawGroupId) => {
			const groupId = Number(rawGroupId);

			return groupId < 0
				? -groupId
				: groupId;
		});
	}

	/**
	 * Returns permission page
	 */
	protected getPermissionsPage(): Promise<Response> {
		const { appId } = this.options;
		let { scope } = this.options;

		if (scope === 'all' || scope === undefined) {
			throw new Error('Required option authScope not set');
		} else if (typeof scope !== 'number') {
			scope = getGroupsPermissionsByName(scope);
		}

		debug('auth scope %s', scope);

		const params = new URLSearchParams({
			group_ids: this.groupIds.join(','),
			redirect_uri: CALLBACK_BLANK,
			response_type: 'token',
			display: 'page',
			v: this.options.apiVersion,
			client_id: String(appId),
			scope: String(scope)
		});

		const url = new URL(`https://oauth.vk.com/authorize?${params}`);

		return this.fetch(url, {
			method: 'GET'
		});
	}

	/**
	 * Starts authorization
	 */
	public async run(): Promise<{
		group: number;
		token: string;
		expires: number;
	}[]> {
		const { response } = await super.login();

		let { hash } = new URL(response.url);

		if (hash.startsWith('#')) {
			hash = hash.substring(1);
		}

		const params = new URLSearchParams(hash);

		if (params.has('error')) {
			throw new AuthorizationError({
				message: `Failed passed grant access: ${params.get('error_description') || 'Unknown error'}`,
				code: AUTHORIZATION_FAILED
			});
		}

		let expires: string | number | undefined = params.get('expires_in') || undefined;

		if (expires !== undefined) {
			expires = Number(expires);
		}

		const tokens: {
			group: number;
			token: string;
			expires: number;
		}[] = [];

		for (const [name, value] of params) {
			if (!name.startsWith('access_token_')) {
				continue;
			}

			/* Example group access_token_XXXXX */
			const { 2: group } = name.split('_');

			tokens.push({
				group: Number(group),
				token: value,
				expires: expires as number
			});
		}

		return tokens;
	}
}
