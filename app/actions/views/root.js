// Copyright (c) 2016-present Mattermost, Inc. All Rights Reserved.
// See License.txt for license information.

import {PostTypes} from 'mattermost-redux/action_types';
import {Client4} from 'mattermost-redux/client';
import {General} from 'mattermost-redux/constants';
import {getClientConfig, getLicenseConfig} from 'mattermost-redux/actions/general';
import {getPosts} from 'mattermost-redux/actions/posts';
import {getMyTeams, getMyTeamMembers, selectTeam} from 'mattermost-redux/actions/teams';

import {
    handleSelectChannel,
    setChannelDisplayName,
    retryGetPostsAction
} from 'app/actions/views/channel';

export function loadConfigAndLicense() {
    return async (dispatch, getState) => {
        const [config, license] = await Promise.all([
            getClientConfig()(dispatch, getState),
            getLicenseConfig()(dispatch, getState)
        ]);

        return {config, license};
    };
}

export function loadFromPushNotification(notification) {
    return async (dispatch, getState) => {
        const state = getState();
        const {data} = notification;
        const {currentTeamId, teams, myMembers: myTeamMembers} = state.entities.teams;
        const {currentChannelId} = state.entities.channels;
        const channelId = data.channel_id;

        // when the notification does not have a team id is because its from a DM or GM
        const teamId = data.team_id || currentTeamId;

        //verify that we have the team loaded
        if (teamId && (!teams[teamId] || !myTeamMembers[teamId])) {
            await Promise.all([
                getMyTeams()(dispatch, getState),
                getMyTeamMembers()(dispatch, getState)
            ]);
        }

        // when the notification is from a team other than the current team
        if (teamId !== currentTeamId) {
            selectTeam({id: teamId})(dispatch, getState);
        }

        // when the notification is from the same channel as the current channel
        // we should get the posts
        if (channelId === currentChannelId) {
            await retryGetPostsAction(getPosts(channelId), dispatch, getState);
        } else {
            // when the notification is from a channel other than the current channel
            dispatch(setChannelDisplayName(''));
            handleSelectChannel(channelId)(dispatch, getState);
        }
    };
}

export function purgeOfflineStore() {
    return {type: General.OFFLINE_STORE_PURGE};
}

export function createPost(post) {
    return async (dispatch, getState) => {
        const state = getState();
        const currentUserId = state.entities.users.currentUserId;

        const timestamp = Date.now();
        const pendingPostId = post.pending_post_id || `${currentUserId}:${timestamp}`;

        const newPost = {
            ...post,
            pending_post_id: pendingPostId,
            create_at: timestamp,
            update_at: timestamp
        };

        try {
            const payload = Client4.createPost({...newPost, create_at: 0});
            dispatch({
                type: PostTypes.RECEIVED_POSTS,
                data: {
                    order: [],
                    posts: {
                        [payload.id]: payload
                    }
                },
                channelId: payload.channel_id
            });
        } catch (error) {
            return {error};
        }

        return {data: true};
    };
}

export default {
    loadConfigAndLicense,
    loadFromPushNotification,
    purgeOfflineStore
};
