// Converse.js
// http://conversejs.org
//
// Copyright (c) 2013-2018, the Converse.js developers
// Licensed under the Mozilla Public License (MPLv2)

import "@converse/headless/converse-roster";
import "@converse/headless/converse-chatboxes";
import "converse-modal";
import Awesomplete from "awesomplete";
import _FormData from "formdata-polyfill";
import converse from "@converse/headless/converse-core";
import tpl_add_contact_modal from "templates/add_contact_modal.html";
import tpl_group_header from "templates/group_header.html";
import tpl_pending_contact from "templates/pending_contact.html";
import tpl_requesting_contact from "templates/requesting_contact.html";
import tpl_roster from "templates/roster.html";
import tpl_roster_filter from "templates/roster_filter.html";
import tpl_roster_item from "templates/roster_item.html";
import tpl_search_contact from "templates/search_contact.html";

const { Backbone, Strophe, $iq, b64_sha1, sizzle, _ } = converse.env;
const u = converse.env.utils;

var createdChatBoxes = [];

converse.plugins.add('converse-rosterview', {

    dependencies: ["converse-roster", "converse-modal"],

    overrides: {
        // Overrides mentioned here will be picked up by converse.js's
        // plugin architecture they will replace existing methods on the
        // relevant objects or classes.
        //
        // New functions which don't exist yet can also be added.
        afterReconnected () {
            this.__super__.afterReconnected.apply(this, arguments);
        },

        tearDown () {
            /* Remove the rosterview when tearing down. It gets created
             * anew when reconnecting or logging in.
             */
            this.__super__.tearDown.apply(this, arguments);
            if (!_.isUndefined(this.rosterview)) {
                this.rosterview.remove();
            }
        },

        RosterGroups: {
            comparator () {
                // RosterGroupsComparator only gets set later (once i18n is
                // set up), so we need to wrap it in this nameless function.
                const { _converse } = this.__super__;
                return _converse.RosterGroupsComparator.apply(this, arguments);
            }
        }
    },


    initialize () {
        /* The initialize function gets called as soon as the plugin is
         * loaded by converse.js's plugin machinery.
         */
        createdChatBoxes = [];
        const { _converse } = this,
              { __ } = _converse;

        _converse.api.settings.update({
            'allow_chat_pending_contacts': true,
            'allow_contact_removal': true,
            'hide_offline_users': false,
            'roster_groups': true,
            'show_only_online_users': false,
            'show_toolbar': true,
            'xhr_user_search_url': null
        });
        _converse.api.promises.add(['rosterViewInitialized']);
        _converse.api.promises.add(['rosterViewTrulyInitial']);


        const STATUSES = {
            'dnd': __('This contact is busy'),
            'online': __('This contact is online'),
            'offline': __('This contact is offline'),
            'unavailable': __('This contact is unavailable'),
            'xa': __('This contact is away for an extended period'),
            'away': __('This contact is away')
        };
        const LABEL_GROUPS = __('Groups');
        const HEADER_CURRENT_CONTACTS =  __('My contacts');
        const HEADER_PENDING_CONTACTS = __('Pending contacts');
        const HEADER_REQUESTING_CONTACTS = __('Contact requests');
        const HEADER_UNGROUPED = __('Ungrouped');
        const HEADER_WEIGHTS = {};
        HEADER_WEIGHTS[HEADER_REQUESTING_CONTACTS] = 0;
        HEADER_WEIGHTS[HEADER_CURRENT_CONTACTS]    = 1;
        HEADER_WEIGHTS[HEADER_UNGROUPED]           = 2;
        HEADER_WEIGHTS[HEADER_PENDING_CONTACTS]    = 3;

        _converse.RosterGroupsComparator = function (a, b) {
            /* Groups are sorted alphabetically, ignoring case.
             * However, Ungrouped, Requesting Contacts and Pending Contacts
             * appear last and in that order.
             */
            a = a.get('name');
            b = b.get('name');
            const special_groups = _.keys(HEADER_WEIGHTS);
            const a_is_special = _.includes(special_groups, a);
            const b_is_special = _.includes(special_groups, b);
            if (!a_is_special && !b_is_special ) {
                return a.toLowerCase() < b.toLowerCase() ? -1 : (a.toLowerCase() > b.toLowerCase() ? 1 : 0);
            } else if (a_is_special && b_is_special) {
                return HEADER_WEIGHTS[a] < HEADER_WEIGHTS[b] ? -1 : (HEADER_WEIGHTS[a] > HEADER_WEIGHTS[b] ? 1 : 0);
            } else if (!a_is_special && b_is_special) {
                return (b === HEADER_REQUESTING_CONTACTS) ? 1 : -1;
            } else if (a_is_special && !b_is_special) {
                return (a === HEADER_REQUESTING_CONTACTS) ? -1 : 1;
            }
        };


        _converse.AddContactModal = _converse.BootstrapModal.extend({
            events: {
                'submit form': 'addContactFromForm'
            },

            initialize () {
                _converse.BootstrapModal.prototype.initialize.apply(this, arguments);
                this.model.on('change', this.render, this);
            },

            toHTML () {
                const label_nickname = _converse.xhr_user_search_url ? __('Contact name') : __('Optional nickname');
                return  tpl_add_contact_modal(_.extend(this.model.toJSON(), {
                    '_converse': _converse,
                    'heading_new_contact': __('Add a Contact'),
                    'label_xmpp_address': __('XMPP Address'),
                    'label_nickname': label_nickname,
                    'contact_placeholder': __('name@example.org'),
                    'label_add': __('Add'),
                    'error_message': __('Please enter a valid XMPP address')
                }));
            },

            afterRender () {
                if (_converse.xhr_user_search_url && _.isString(_converse.xhr_user_search_url)) {
                    this.initXHRAutoComplete(this.el);
                } else {
                    this.initJIDAutoComplete(this.el);
                }
                const jid_input = this.el.querySelector('input[name="jid"]');
                this.el.addEventListener('shown.bs.modal', () => {
                    jid_input.focus();
                }, false);
            },

            initJIDAutoComplete (root) {
                const jid_input = root.querySelector('input[name="jid"]');
                const list = _.uniq(_converse.roster.map((item) => Strophe.getDomainFromJid(item.get('jid'))));
                new Awesomplete(jid_input, {
                    'list': list,
                    'data': function (text, input) {
                        return input.slice(0, input.indexOf("@")) + "@" + text;
                    },
                    'filter': Awesomplete.FILTER_STARTSWITH
                });
            },

            initXHRAutoComplete (root) {
                const name_input = this.el.querySelector('input[name="name"]');
                const jid_input = this.el.querySelector('input[name="jid"]');
                const awesomplete = new Awesomplete(name_input, {
                    'minChars': 1,
                    'list': []
                });
                const xhr = new window.XMLHttpRequest();
                // `open` must be called after `onload` for mock/testing purposes.
                xhr.onload = function () {
                    if (xhr.responseText) {
                        awesomplete.list = JSON.parse(xhr.responseText).map((i) => { //eslint-disable-line arrow-body-style
                            return {'label': i.fullname || i.jid, 'value': i.jid};
                        });
                        awesomplete.evaluate();
                    }
                };
                name_input.addEventListener('input', _.debounce(() => {
                    xhr.open("GET", `${_converse.xhr_user_search_url}q=${name_input.value}`, true);
                    xhr.send()
                } , 300));
                this.el.addEventListener('awesomplete-selectcomplete', (ev) => {
                    jid_input.value = ev.text.value;
                    name_input.value = ev.text.label;
                });
            },

            addContactFromForm (ev) {
                ev.preventDefault();
                const data = new FormData(ev.target),
                      jid = data.get('jid'),
                      name = data.get('name');
                if (!jid || _.compact(jid.split('@')).length < 2) {
                    // XXX: we have to do this manually, instead of via
                    // toHTML because Awesomplete messes things up and
                    // confuses Snabbdom
                    u.addClass('is-invalid', this.el.querySelector('input[name="jid"]'));
                    u.addClass('d-block', this.el.querySelector('.invalid-feedback'));
                } else {
                    ev.target.reset();
                    _converse.roster.addAndSubscribe(jid, name);
                    this.model.clear();
                    this.modal.hide();
                }
            }
        });


        _converse.RosterFilter = Backbone.Model.extend({
            initialize () {
                this.set({
                    'filter_text': '',
                    'filter_type': 'contacts',
                    'chat_state': ''
                });
            },
        });

        _converse.RosterFilterView = Backbone.VDOMView.extend({
            tagName: 'form',
            className: 'roster-filter-form',
            events: {
                "keydown .roster-filter": "liveFilter",
                "submit form.roster-filter-form": "submitFilter",
                "click .clear-input": "clearFilter",
                "click .filter-by span": "changeTypeFilter",
                "change .state-type": "changeChatStateFilter"
            },

            initialize () {
                this.model.on('change:filter_type', this.render, this);
                this.model.on('change:filter_text', this.render, this);
            },

            toHTML () {
                return tpl_roster_filter(
                    _.extend(this.model.toJSON(), {
                        visible: this.shouldBeVisible(),
                        placeholder: __('Filter'),
                        title_contact_filter: __('Filter by contact name'),
                        title_group_filter: __('Filter by group name'),
                        title_status_filter: __('Filter by status'),
                        label_any: __('Any'),
                        label_unread_messages: __('Unread'),
                        label_online: __('Online'),
                        label_chatty: __('Chatty'),
                        label_busy: __('Busy'),
                        label_away: __('Away'),
                        label_xa: __('Extended Away'),
                        label_offline: __('Offline')
                    }));
            },

            changeChatStateFilter (ev) {
                if (ev && ev.preventDefault) { ev.preventDefault(); }
                this.model.save({
                    'chat_state': this.el.querySelector('.state-type').value
                });
            },

            changeTypeFilter (ev) {
                if (ev && ev.preventDefault) { ev.preventDefault(); }
                const type = ev.target.dataset.type;
                if (type === 'state') {
                    this.model.save({
                        'filter_type': type,
                        'chat_state': this.el.querySelector('.state-type').value
                    });
                } else {
                    this.model.save({
                        'filter_type': type,
                        'filter_text': this.el.querySelector('.roster-filter').value
                    });
                }
            },

            liveFilter: _.debounce(function (ev) {
                this.model.save({
                    'filter_text': this.el.querySelector('.roster-filter').value
                });
            }, 250),

            submitFilter (ev) {
                if (ev && ev.preventDefault) { ev.preventDefault(); }
                this.liveFilter();
                this.render();
            },

            isActive () {
                /* Returns true if the filter is enabled (i.e. if the user
                 * has added values to the filter).
                 */
                if (this.model.get('filter_type') === 'state' ||
                    this.model.get('filter_text')) {
                    return true;
                }
                return false;
            },

            shouldBeVisible () {
                return _converse.roster.length >= 5 || this.isActive();
            },

            showOrHide () {
                if (this.shouldBeVisible()) {
                    this.show();
                } else {
                    this.hide();
                }
            },

            show () {
                if (u.isVisible(this.el)) { return this; }
                this.el.classList.add('fade-in');
                this.el.classList.remove('hidden');
                return this;
            },

            hide () {
                if (!u.isVisible(this.el)) { return this; }
                this.model.save({
                    'filter_text': '',
                    'chat_state': ''
                });
                this.el.classList.add('hidden');
                return this;
            },

            clearFilter (ev) {
                if (ev && ev.preventDefault) {
                    ev.preventDefault();
                    u.hideElement(this.el.querySelector('.clear-input'));
                }
                const roster_filter = this.el.querySelector('.roster-filter');
                roster_filter.value = '';
                this.model.save({'filter_text': ''});
            }
        });

        _converse.RosterContactView = Backbone.NativeView.extend({
            tagName: 'li',
            className: 'list-item d-flex hidden controlbox-padded',

            events: {
                "click .accept-xmpp-request": "acceptRequest",
                "click .decline-xmpp-request": "declineRequest",
                "click .open-chat": "openChat",
                "click .remove-xmpp-contact": "removeContact"
            },

            initialize () {
                this.model.on("change", this.render, this);
                this.model.on("highlight", this.highlight, this);
                this.model.on("destroy", this.remove, this);
                this.model.on("open", this.openChat, this);
                this.model.on("remove", this.remove, this);

                this.model.presence.on("change:show", this.render, this);
                this.model.vcard.on('change:fullname', this.render, this);
                this.on('changed:group', this.render, this);
            },

            render () {
                const that = this;
                if (!this.mayBeShown()) {
                    u.hideElement(this.el);
                    return this;
                }
                const ask = this.model.get('ask'),
                    show = this.model.presence.get('show'),
                    requesting  = this.model.get('requesting'),
                    subscription = this.model.get('subscription');

                const classes_to_remove = [
                    'current-xmpp-contact',
                    'pending-xmpp-contact',
                    'requesting-xmpp-contact'
                    ].concat(_.keys(STATUSES));

                _.each(classes_to_remove,
                    function (cls) {
                        if (_.includes(that.el.className, cls)) {
                            that.el.classList.remove(cls);
                        }
                    });
                this.el.classList.add(show);
                this.el.setAttribute('data-status', show);
                this.highlight();

                if (_converse.isSingleton()) {
                    const chatbox = _converse.chatboxes.get(this.model.get('jid'));
                    if (chatbox) {
                        if (chatbox.get('hidden')) {
                            this.el.classList.remove('open');
                        } else {
                            this.el.classList.add('open');
                        }
                    }
                }
                this.el.classList.add('current-xmpp-contact');
                this.el.classList.remove(_.without(['both', 'to'], subscription)[0]);
                this.el.classList.add(subscription);
                //wait for group to finish rendering first, so that we can access it as parent of this.el
                setTimeout(() => {
                  const parentElement = this.el.parentElement;
                  let group = '';
                  if (parentElement) {
                    group = parentElement.getAttribute('data-group');
                  }
                  this.renderRosterItem(this.model, group);
                }, 0)
                return this;
            },

            highlight () {
                /* If appropriate, highlight the contact (by adding the 'open' class).
                 */
                if (_converse.isSingleton()) {
                    const chatbox = _converse.chatboxes.get(this.model.get('jid'));
                    if (chatbox) {
                        if (chatbox.get('hidden')) {
                            this.el.classList.remove('open');
                        } else {
                            if (!chatbox.get('latestMessageTime')) {
                                this.el.classList.add('open');
                            }
                        }
                    }
                }
            },

            renderRosterItem (item, group) {
                let status_icon = `fa chat-status ${group === 'Address Book' ? 'open-single' : 'open-organization'}`;
                const show = 'online';
                const display_name = item.getDisplayName();
                this.el.innerHTML = tpl_roster_item(
                    _.extend(item.toJSON(), {
                        'display_name': display_name,
                        'desc_status': STATUSES[show],
                        'status_icon': status_icon,
                        'desc_chat': __('Click to chat with %1$s (JID: %2$s)', display_name, item.get('jid')),
                        'desc_remove': __('Click to remove %1$s as a contact', display_name),
                        'allow_contact_removal': _converse.allow_contact_removal,
                        'num_unread': item.get('num_unread') || 0
                    })
                );
                if (!createdChatBoxes.includes(item.get('jid'))) {
                  var time = _converse.api.getRecentChat(item.get('jid'));
                  if (time) {
                    const fromNow = (new Date()).getTime() - (new Date(time)).getTime();
                    const withIn24h = fromNow < (60 * 60 * 24 * 1000);
                    if (withIn24h) {
                      const attrs = this.model.attributes;
                      attrs["latestMessageTime"] = new Date();
                      _converse.api.chats.create(attrs.jid, attrs);
                    }else {
                      _converse.api.setRecentChat(item.get('jid'), null);
                    }
                    createdChatBoxes.push(item.get('jid'));
                  }
                }
                return this;
            },

            mayBeShown () {
                /* Return a boolean indicating whether this contact should
                 * generally be visible in the roster.
                 *
                 * It doesn't check for the more specific case of whether
                 * the group it's in is collapsed.
                 */
                const chatStatus = this.model.presence.get('show');
                if ((_converse.show_only_online_users && chatStatus !== 'online') ||
                    (_converse.hide_offline_users && chatStatus === 'offline')) {
                    // If pending or requesting, show
                    if ((this.model.get('ask') === 'subscribe') ||
                            (this.model.get('subscription') === 'from') ||
                            (this.model.get('requesting') === true)) {
                        return true;
                    }
                    return false;
                }
                return true;
            },

            openChat (ev) {
                if (ev && ev.preventDefault) { ev.preventDefault(); }
                 _converse.emit('aChatRoomOpen');
                const attrs = this.model.attributes;
                _converse.api.chats.open(attrs.jid, attrs);
            },

            async removeContact (ev) {
                if (ev && ev.preventDefault) { ev.preventDefault(); }
                if (!_converse.allow_contact_removal) { return; }
                if (!confirm(__("Are you sure you want to remove this contact?"))) { return; }

                let iq;
                try {
                    iq = await this.model.removeFromRoster();
                    this.remove();
                    if (this.model.collection) {
                        // The model might have already been removed as
                        // result of a roster push.
                        this.model.destroy();
                    }
                } catch (e) {
                    _converse.log(e, Strophe.LogLevel.ERROR);
                    _converse.api.alert.show(
                        Strophe.LogLevel.ERROR,
                        __('Sorry, there was an error while trying to remove %1$s as a contact.', name)
                    );
                }
            },

            async acceptRequest (ev) {
                if (ev && ev.preventDefault) { ev.preventDefault(); }

                await _converse.roster.sendContactAddIQ(
                    this.model.get('jid'),
                    this.model.getFullname(),
                    []
                );
                this.model.authorize().subscribe();
            },

            declineRequest (ev) {
                if (ev && ev.preventDefault) { ev.preventDefault(); }
                const result = confirm(__("Are you sure you want to decline this contact request?"));
                if (result === true) {
                    this.model.unauthorize().destroy();
                }
                return this;
            }
        });

        _converse.RosterGroupView = Backbone.OrderedListView.extend({
            tagName: 'div',
            className: 'roster-group controlbox-section hidden',
            events: {
                "click a.group-toggle": "toggle"
            },

            ItemView: _converse.RosterContactView,
            listItems: 'model.contacts',
            listSelector: '.roster-group-contacts',
            sortEvent: 'presenceChanged',

            initialize () {
                // const loading = _converse.rosterview.loading_el;
                // u.hideElement(loading);
                Backbone.OrderedListView.prototype.initialize.apply(this, arguments);
                this.model.contacts.on("change:subscription", this.onContactSubscriptionChange, this);
                this.model.contacts.on("change:requesting", this.onContactRequestChange, this);
                this.model.contacts.on("remove", this.onRemove, this);
                _converse.roster.on('change:groups', this.onContactGroupChange, this);

                // This event gets triggered once *all* contacts (i.e. not
                // just this group's) have been fetched from browser
                // storage or the XMPP server and once they've been
                // assigned to their various groups.
                _converse.rosterview.on(
                    'rosterContactsFetchedAndProcessed',
                    this.sortAndPositionAllItems.bind(this)
                );
            },

            render () {
                this.el.setAttribute('data-group', this.model.get('name'));
                this.el.innerHTML = tpl_group_header({
                    'label_group': this.model.get('name'),
                    'desc_group_toggle': this.model.get('description'),
                    'toggle_state': this.model.get('state'),
                    '_converse': _converse
                });
                this.contacts_el = this.el.querySelector('.roster-group-contacts');
                this.contacts_el.setAttribute('data-group', this.model.get('name'));
                return this;
            },

            show () {
                u.showElement(this.el);
                _.each(this.getAll(), (contact_view) => {
                    if (contact_view.mayBeShown() && this.model.get('state') === _converse.OPENED) {
                        u.showElement(contact_view.el);
                    }
                });
                return this;
            },

            collapse () {
                return u.slideIn(this.contacts_el);
            },

            filterOutContacts (contacts=[]) {
                /* Given a list of contacts, make sure they're filtered out
                 * (aka hidden) and that all other contacts are visible.
                 *
                 * If all contacts are hidden, then also hide the group
                 * title.
                 */
                let shown = 0;
                const all_contact_views = this.getAll();
                _.each(this.model.contacts.models, (contact) => {
                    const contact_view = this.get(contact.get('id'));
                    if (contact_view) {
                        contact_view.el.setAttribute('data-group', this.model.get('name'));
                        if (_.includes(contacts, contact)) {
                          u.hideElement(contact_view.el);
                        } else if (contact_view.mayBeShown()) {
                          u.showElement(contact_view.el);
                          shown += 1;
                        }
                    }
                });
                if (shown) {
                    u.showElement(this.el);
                } else {
                    u.hideElement(this.el);
                }
            },

            getFilterMatches (q, type) {
                /* Given the filter query "q" and the filter type "type",
                 * return a list of contacts that need to be filtered out.
                 */
                if (q.length === 0) {
                    return [];
                }
                let matches;
                q = q.toLowerCase();
                if (type === 'state') {
                    if (this.model.get('name') === HEADER_REQUESTING_CONTACTS) {
                        // When filtering by chat state, we still want to
                        // show requesting contacts, even though they don't
                        // have the state in question.
                        matches = this.model.contacts.filter(
                            (contact) => !_.includes(contact.presence.get('show'), q) && !contact.get('requesting')
                        );
                    } else if (q === 'unread_messages') {
                        matches = this.model.contacts.filter({'num_unread': 0});
                    } else {
                        matches = this.model.contacts.filter(
                            (contact) => !_.includes(contact.presence.get('show'), q)
                        );
                    }
                } else  {
                    matches = this.model.contacts.filter((contact) => {
                        return !_.includes(contact.getDisplayName().toLowerCase(), q.toLowerCase());
                    });
                }
                return matches;
            },

            filter (q, type) {
                /* Filter the group's contacts based on the query "q".
                 *
                 * If all contacts are filtered out (i.e. hidden), then the
                 * group must be filtered out as well.
                 */
                if (_.isNil(q)) {
                    type = type || _converse.rosterview.filter_view.model.get('filter_type');
                    if (type === 'state') {
                        q = _converse.rosterview.filter_view.model.get('chat_state');
                    } else {
                        q = _converse.rosterview.filter_view.model.get('filter_text');
                    }
                }
                this.filterOutContacts(this.getFilterMatches(q, type));
            },

            async toggle (ev) {
                if (ev && ev.preventDefault) { ev.preventDefault(); }
                const icon_el = ev.target.querySelector('.fa');
                if (_.includes(icon_el.classList, "fa-caret-down")) {
                    this.model.save({state: _converse.CLOSED});
                    await this.collapse();
                    icon_el.classList.remove("fa-caret-down");
                    icon_el.classList.add("fa-caret-right");
                } else {
                    icon_el.classList.remove("fa-caret-right");
                    icon_el.classList.add("fa-caret-down");
                    this.model.save({state: _converse.OPENED});
                    this.filter();
                    u.showElement(this.el);
                    u.slideOut(this.contacts_el);
                }
            },

            onContactGroupChange (contact) {
                const in_this_group = _.includes(contact.get('groups'), this.model.get('name'));
                const cid = contact.get('id');
                const in_this_overview = !this.get(cid);
                if (in_this_group && !in_this_overview) {
                    this.items.trigger('add', contact);
                } else if (!in_this_group) {
                    this.removeContact(contact);
                }
            },

            onContactSubscriptionChange (contact) {
                if ((this.model.get('name') === HEADER_PENDING_CONTACTS) && contact.get('subscription') !== 'from') {
                    this.removeContact(contact);
                }
            },

            onContactRequestChange (contact) {
                if ((this.model.get('name') === HEADER_REQUESTING_CONTACTS) && !contact.get('requesting')) {
                    this.removeContact(contact);
                }
            },

            removeContact (contact) {
                // We suppress events, otherwise the remove event will
                // also cause the contact's view to be removed from the
                // "Pending Contacts" group.
                this.model.contacts.remove(contact, {'silent': true});
                this.onRemove(contact);
            },

            onRemove (contact) {
                this.remove(contact.get('jid'));
                if (this.model.contacts.length === 0) {
                    this.remove();
                }
            }
        });

        _converse.RosterView = Backbone.OrderedListView.extend({
            tagName: 'div',
            id: 'converse-roster',
            className: '',

            ItemView: _converse.RosterGroupView,
            listItems: 'model',
            listSelector: '.roster-contacts',
            sortEvent: null, // Groups are immutable, so they don't get re-sorted
            subviewIndex: 'name',

            events: {
                'click a.controlbox-heading__btn.add-contact': 'showAddContactModal',
                'click a.controlbox-heading__btn.sync-contacts': 'syncContacts'
            },

            initialize () {
                Backbone.OrderedListView.prototype.initialize.apply(this, arguments);
                _converse.roster.on("add", this.onContactAdded, this);
                _converse.roster.on('change:groups', this.onContactAdded, this);
                _converse.roster.on('change', this.onContactAdded, this);
                _converse.roster.on("destroy", this.update, this);
                _converse.roster.on("remove", this.update, this);
                _converse.presences.on('change:show', () => {
                    this.update();
                    this.updateFilter();
                });
                this.model.on("reset", this.reset, this);
                // This event gets triggered once *all* contacts (i.e. not
                // just this group's) have been fetched from browser
                // storage or the XMPP server and once they've been
                // assigned to their various groups.
                _converse.on('rosterGroupsFetched',

                this.sortAndPositionAllItems.bind(this));

                _converse.on('rosterContactsFetched', () => {
                    _converse.roster.each((contact) => this.addRosterContact(contact, {'silent': true}));
                    this.update();
                    this.updateFilter();
                    this.trigger('rosterContactsFetchedAndProcessed');
                });
                this.createRosterFilter();
            },

            render () {
                this.el.innerHTML = tpl_roster({
                    'allow_contact_requests': _converse.allow_contact_requests,
                    'heading_contacts': __('Contacts'),
                    'title_add_contact': __('Add a contact'),
                    'title_sync_contacts': __('Re-sync your contacts')
                });
                const form = this.el.querySelector('.roster-filter-form');
                // this.el.replaceChild(this.filter_view.render().el, form);
                this.roster_el = this.el.querySelector('.roster-contacts');
                //this.loading_el = this.el.querySelector('.roster-loading');
                this.loading_contact = this.el.querySelector('.roster-loading-Contacts');
                this.loading_org = this.el.querySelector('.roster-loading-Organization');
                u.showElement(this.loading_contact);
                u.showElement(this.loading_org);
                return this;
            },

            showAddContactModal (ev) {
                if (_.isUndefined(this.add_contact_modal)) {
                    this.add_contact_modal = new _converse.AddContactModal({'model': new Backbone.Model()});
                }
                this.add_contact_modal.show(ev);
            },

            createRosterFilter () {
                // Create a model on which we can store filter properties
                const model = new _converse.RosterFilter();
                model.id = b64_sha1(`_converse.rosterfilter${_converse.bare_jid}`);
                model.browserStorage = new Backbone.BrowserStorage.local(this.filter.id);
                this.filter_view = new _converse.RosterFilterView({'model': model});
                this.filter_view.model.on('change', this.updateFilter, this);
                this.filter_view.model.fetch();
            },

            updateFilter: _.debounce(function () {
                /* Filter the roster again.
                 * Called whenever the filter settings have been changed or
                 * when contacts have been added, removed or changed.
                 *
                 * Debounced so that it doesn't get called for every
                 * contact fetched from browser storage.
                 */
                const type = this.filter_view.model.get('filter_type');
                if (type === 'state') {
                    this.filter(this.filter_view.model.get('chat_state'), type);
                } else {
                    this.filter(this.filter_view.model.get('filter_text'), type);
                }
            }, 100),

            update: _.debounce(function () {
                _converse.emit('rosterViewTrulyInitial');
                if (!u.isVisible(this.roster_el)) {
                    u.showElement(this.roster_el);
                }
                this.filter_view.showOrHide();
                return this;
            }, _converse.animate ? 100 : 0),

            filter (query, type) {
                // First we make sure the filter is restored to its
                // original state
                _.each(this.getAll(), function (view) {
                    if (view.model.contacts.length > 0) {
                        view.show().filter('');
                    }
                });
                // Now we can filter
                query = query.toLowerCase();
                if (type === 'groups') {
                    _.each(this.getAll(), function (view, idx) {
                        if (!_.includes(view.model.get('name').toLowerCase(), query.toLowerCase())) {
                            u.slideIn(view.el);
                        } else if (view.model.contacts.length > 0) {
                            u.slideOut(view.el);
                        }
                    });
                } else {
                    _.each(this.getAll(), function (view) {
                        view.filter(query, type);
                    });
                }
            },

            async syncContacts (ev) {
                ev.preventDefault();
                u.addClass('fa-spin', ev.target);
                _converse.roster.data.save('version', null);
                await _converse.roster.fetchFromServer();
                _converse.xmppstatus.sendPresence();
                u.removeClass('fa-spin', ev.target);
            },

            reset () {
                _converse.roster.reset();
                this.removeAll();
                this.render().update();
                return this;
            },

            onContactAdded (contact) {
                this.addRosterContact(contact)
                this.update();
                this.updateFilter();
            },

            onContactChange (contact) {
                this.updateChatBox(contact)
                this.update();
                // if (_.has(contact.changed, 'subscription')) {
                //     if (contact.changed.subscription === 'from') {
                //         this.addContactToGroup(contact, HEADER_PENDING_CONTACTS);
                //     } else if (_.includes(['both', 'to'], contact.get('subscription'))) {
                //         this.addExistingContact(contact);
                //     }
                // }
                // if (_.has(contact.changed, 'ask') && contact.changed.ask === 'subscribe') {
                //     this.addContactToGroup(contact, HEADER_PENDING_CONTACTS);
                // }
                // if (_.has(contact.changed, 'subscription') && contact.changed.requesting === 'true') {
                //     this.addContactToGroup(contact, HEADER_REQUESTING_CONTACTS);
                // }
                this.updateFilter();
            },

            updateChatBox (contact) {
                if (!this.model.chatbox) {
                    return this;
                }
                const changes = {};
                if (_.has(contact.changed, 'status')) {
                    changes.status = contact.get('status');
                }
                this.model.chatbox.save(changes);
                return this;
            },

            getGroup (name) {
                /* Returns the group as specified by name.
                 * Creates the group if it doesn't exist.
                 */
                const view =  this.get(name);
                if (view) {
                    return view.model;
                }
                return this.model.create({name, id: b64_sha1(name)});
            },

            addContactToGroup (contact, name, options) {
                this.getGroup(name).contacts.add(contact, options);
                this.sortAndPositionAllItems();
            },

            addExistingContact (contact, options) {
                let groups;
                if (_converse.roster_groups) {
                    groups = contact.get('groups');
                    if (groups.length === 0) {
                        groups = [HEADER_UNGROUPED];
                    }
                } else {
                    groups = [HEADER_CURRENT_CONTACTS];
                }
                _.each(groups, _.bind(this.addContactToGroup, this, contact, _, options));
            },

            addRosterContact (contact, options) {
                if (contact.get('subscription') === 'both' || contact.get('subscription') === 'to') {
                    this.addExistingContact(contact, options);
                } else {
                    if (!_converse.allow_contact_requests) {
                        _converse.log(
                            `Not adding requesting or pending contact ${contact.get('jid')} `+
                            `because allow_contact_requests is false`,
                            Strophe.LogLevel.DEBUG
                        );
                        return;
                    }
                    if ((contact.get('ask') === 'subscribe') || (contact.get('subscription') === 'from')) {
                        this.addContactToGroup(contact, HEADER_PENDING_CONTACTS, options);
                    } else if (contact.get('requesting') === true) {
                        this.addContactToGroup(contact, HEADER_REQUESTING_CONTACTS, options);
                    }
                }
                return this;
            }
        });


        /* -------- Event Handlers ----------- */
        _converse.api.listen.on('chatBoxesInitialized', () => {

            _converse.chatboxes.on('change:hidden', (chatbox) => {
                const contact = _converse.roster.findWhere({'jid': chatbox.get('jid')});
                if (!_.isUndefined(contact)) {
                    contact.trigger('highlight', contact);
                }
            });
        });

        function initRoster () {
            /* Create an instance of RosterView once the RosterGroups
             * collection has been created (in @converse/headless/converse-core.js)
             */
            if (_converse.authentication === _converse.ANONYMOUS) {
                return;
            }
            _converse.rosterview = new _converse.RosterView({
                'model': _converse.rostergroups
            });
            // _converse.rosterGroup = new _converse.RosterGroupView({
            //     'model': _converse.rostergroups
            // })
            _converse.emit('justShowbackground');
            _converse.rosterview.render();
            _converse.on('load-done', (labelName) => {
                if (labelName === 'Address Book') {
                    u.hideElement(_converse.rosterview.loading_contact);
                }
                else {
                    u.hideElement(_converse.rosterview.loading_org);
                }
            })
            _converse.emit('rosterViewInitialized');
        }

        _converse.api.listen.on('rosterInitialized', initRoster);
        _converse.api.listen.on('rosterReadyAfterReconnection', initRoster);
    }
});
