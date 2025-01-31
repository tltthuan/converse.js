// Converse.js
// http://conversejs.org
//
// Copyright (c) 2012-2018, the Converse.js developers
// Licensed under the Mozilla Public License (MPLv2)

import "./utils/emoji";
import "./utils/form";
import converse from "./converse-core";
import filesize from "filesize";
// import RNCryptor from "./rncryptor";
// const RNCryptorPassword = 'vQgPmpQF0YILwViIJvuTPXdoxaBkYQdk';
const { $msg, Backbone, Promise, Strophe, b64_sha1, moment, sizzle, utils, _ } = converse.env;
const u = converse.env.utils;
const RNCryptor = converse.env.RNCryptor;
Strophe.addNamespace('MESSAGE_CORRECT', 'urn:xmpp:message-correct:0');
Strophe.addNamespace('RECEIPTS', 'urn:xmpp:receipts');
Strophe.addNamespace('REFERENCE', 'urn:xmpp:reference:0');


converse.plugins.add('converse-chatboxes', {

    dependencies: ["converse-roster", "converse-vcard"],

    initialize () {
        /* The initialize function gets called as soon as the plugin is
         * loaded by converse.js's plugin machinery.
         */
        const { _converse } = this,
              { __ } = _converse,
              timeToRead = _converse.user_settings.time_to_read || '86400';

        // Configuration values for this plugin
        // ====================================
        // Refer to docs/source/configuration.rst for explanations of these
        // configuration settings.
        _converse.api.settings.update({
            'auto_join_private_chats': [],
            'filter_by_resource': false,
            'forward_messages': false,
            'send_chat_state_notifications': true
        });
        _converse.api.promises.add([
            'chatBoxesFetched',
            'chatBoxesInitialized',
            'privateChatsAutoJoined',
            'chatOpenned'
        ]);

        function openChat (jid) {
            if (!utils.isValidJID(jid)) {
                return _converse.log(
                    `Invalid JID "${jid}" provided in URL fragment`,
                    Strophe.LogLevel.WARN
                );
            }
            _converse.api.chats.open(jid);
        }
        _converse.router.route('converse/chat?jid=:jid', openChat);


        _converse.Message = Backbone.Model.extend({

            defaults () {
                return {
                    'msgid': _converse.connection.getUniqueId(),
                    'time': moment().format()
                };
            },

            initialize () {
                this.setVCard();
                if (this.get('file')) {
                    this.on('change:put', this.uploadFile, this);
                }
                if (this.isOnlyChatStateNotification()) {
                    window.setTimeout(this.destroy.bind(this), 20000);
                }
            },

            getVCardForChatroomOccupant () {
                const chatbox = this.collection.chatbox,
                      nick = Strophe.getResourceFromJid(this.get('from'));

                if (chatbox.get('nick') === nick) {
                    return _converse.xmppstatus.vcard;
                } else {
                    let vcard;
                    if (this.get('vcard_jid')) {
                        vcard = _converse.vcards.findWhere({
                          'jid': this.get('vcard_jid')
                        });
                    }
                    if (!vcard) {
                        let jid = this.get('from');
                        jid = jid.replace(`${chatbox.get('jid')}/`, ''); // remove conference's jid
                        vcard = _converse.vcards.findWhere({
                          'jid': jid
                        }) || _converse.vcards.create({
                          'jid': jid
                        });
                    }
                    return vcard;
                }
            },

            setVCard () {
                if (this.get('type') === 'error') {
                    return;
                } else if (this.get('type') === 'groupchat') {
                    this.vcard = this.getVCardForChatroomOccupant();
                } else {
                    const jid = this.get('from');
                    this.vcard = _converse.vcards.findWhere({'jid': jid}) || _converse.vcards.create({'jid': jid});
                    _converse.on('updateProfile', data => {
                        this.vcard.save({
                          'fullname': data.fullName
                        })
                    })
                }
            },

            isOnlyChatStateNotification () {
                return u.isOnlyChatStateNotification(this);
            },

            getDisplayName () {
                if (this.get('type') === 'groupchat') {
                    return this.get('senderName') || this.vcard.get('fullname') ||  'Loading...';
                } else {
                    return this.get('senderFullName') || this.vcard.get('fullname') || 'Loading...';
                }
            },

            sendSlotRequestStanza () {
                /* Send out an IQ stanza to request a file upload slot.
                 *
                 * https://xmpp.org/extensions/xep-0363.html#request
                 */
                if (_.isNil(this.file)) {
                    return Promise.reject(new Error("file is undefined"));
                }
                const iq = converse.env.$iq({
                    'from': _converse.jid,
                    'to': this.get('slot_request_url'),
                    'type': 'get'
                }).c('request', {
                    'xmlns': Strophe.NS.HTTPUPLOAD,
                    'filename': this.file.name,
                    'size': this.file.size,
                    'content-type': this.file.type
                })
                return _converse.api.sendIQ(iq);
            },

            async getRequestSlotURL () {
                let stanza;
                try {
                    stanza = await this.sendSlotRequestStanza();
                } catch (e) {
                    _converse.log(e, Strophe.LogLevel.ERROR);
                    return this.save({
                        'type': 'error',
                        'message': __("Sorry, could not determine upload URL.")
                    });
                }
                const slot = stanza.querySelector('slot');
                if (slot) {
                    this.save({
                        'get':  slot.querySelector('get').getAttribute('url'),
                        'put': slot.querySelector('put').getAttribute('url'),
                    });
                } else {
                    return this.save({
                        'type': 'error',
                        'message': __("Sorry, could not determine file upload URL.")
                    });
                }
            },

            uploadFile () {
                const xhr = new XMLHttpRequest();
                xhr.onreadystatechange = () => {
                    if (xhr.readyState === XMLHttpRequest.DONE) {
                        _converse.log("Status: " + xhr.status, Strophe.LogLevel.INFO);
                        if (xhr.status === 200 || xhr.status === 201) {
                            this.save({
                                'upload': _converse.SUCCESS,
                                'oob_url': this.get('get'),
                                'message': this.get('get')
                            });
                        } else {
                            xhr.onerror();
                        }
                    }
                };

                xhr.upload.addEventListener("progress", (evt) => {
                    if (evt.lengthComputable) {
                        this.set('progress', evt.loaded / evt.total);
                    }
                }, false);

                xhr.onerror = () => {
                    let message;
                    if (xhr.responseText) {
                        message = __('Sorry, could not succesfully upload your file. Your server’s response: "%1$s"', xhr.responseText)
                    } else {
                        message = __('Sorry, could not succesfully upload your file.');
                    }
                    this.save({
                        'type': 'error',
                        'upload': _converse.FAILURE,
                        'message': message
                    });
                };
                xhr.open('PUT', this.get('put'), true);
                xhr.setRequestHeader("Content-type", this.file.type);
                xhr.send(this.file);
            }
        });


        _converse.Messages = Backbone.Collection.extend({
            model: _converse.Message,
            comparator: 'time'
        });


        _converse.ChatBox = _converse.ModelWithVCardAndPresence.extend({
            defaults () {
                return {
                    'bookmarked': false,
                    'chat_state': undefined,
                    'num_unread': 0,
                    'type': _converse.PRIVATE_CHAT_TYPE,
                    'message_type': 'chat',
                    'url': '',
                    'hidden': _.includes(['mobile', 'fullscreen'], _converse.view_mode)
                }
            },

            initialize () {
                if (!this.get('message_type')) {
                  return;
                }
                _converse.ModelWithVCardAndPresence.prototype.initialize.apply(this, arguments);

                _converse.api.waitUntil('rosterContactsFetched').then(() => {
                    this.addRelatedContact(_converse.roster.findWhere({'jid': this.get('jid')}));
                });
                this.messages = new _converse.Messages();
                const storage = _converse.config.get('storage');
                this.messages.browserStorage = new Backbone.BrowserStorage[storage](
                    b64_sha1(`converse.messages${this.get('jid')}${_converse.bare_jid}`));
                this.messages.chatbox = this;
                this.messages.on('change:upload', (message) => {
                    if (message.get('upload') === _converse.SUCCESS) {
                        this.sendMessageStanza(this.createMessageStanza(message, 'text', message.get('message')));
                    }
                });

                // this.on('change:chat_state', this.sendChatState, this);

                this.save({
                    // The chat_state will be set to ACTIVE once the chat box is opened
                    // and we listen for change:chat_state, so shouldn't set it to ACTIVE here.
                    'box_id' : b64_sha1(this.get('jid')),
                    'time_opened': this.get('time_opened') || moment().valueOf(),
                    'user_id' : Strophe.getNodeFromJid(this.get('jid'))
                });
            },

            addRelatedContact (contact) {
                if (!_.isUndefined(contact)) {
                    this.contact = contact;
                    this.trigger('contactAdded', contact);
                }
            },

            getDisplayName () {
                return this.vcard.get('fullname') || 'Loading...';
            },

            handleMessageCorrection (stanza) {
                const replace = sizzle(`replace[xmlns="${Strophe.NS.MESSAGE_CORRECT}"]`, stanza).pop();
                if (replace) {
                    const msgid = replace && replace.getAttribute('id') || stanza.getAttribute('id'),
                        message = msgid && this.messages.findWhere({msgid});

                    if (!message) {
                        // XXX: Looks like we received a correction for a
                        // non-existing message, probably due to MAM.
                        // Not clear what can be done about this... we'll
                        // just create it as a separate message for now.
                        return false;
                    }
                    const older_versions = message.get('older_versions') || [];
                    older_versions.push(message.get('message'));
                    message.save({
                        'message': _converse.chatboxes.getMessageBody(stanza),
                        'references': this.getReferencesFromStanza(stanza),
                        'older_versions': older_versions,
                        'edited': moment().format()
                    });
                    return true;
                }
                return false;
            },

            handleReceipt (stanza) {
                const to_bare_jid = Strophe.getBareJidFromJid(stanza.getAttribute('to'));
                if (to_bare_jid === _converse.bare_jid) {
                    const receipt = sizzle(`received[xmlns="${Strophe.NS.RECEIPTS}"]`, stanza).pop();
                    if (receipt) {
                        const msgid = receipt && receipt.getAttribute('id'),
                            message = msgid && this.messages.findWhere({msgid});
                        if (message && !message.get('received')) {
                            message.save({
                                'received': moment().format()
                            });
                        }
                        return true;
                    }
                }
                return false;
            },

            createMessageStanza (message, type, body) {
                /* Given a _converse.Message Backbone.Model, return the XML
                 * stanza that represents it.
                 *
                 *  Parameters:
                 *    (Object) message - The Backbone.Model representing the message
                 */
                let sentDate = message.get('sent');
                sentDate = Math.round(sentDate);
                let rawText = '';
                switch (type) {
                  case 'text':
                    rawText = body;
                    body = RNCryptor.pagemeEncrypt(_converse.user_settings.pagemeEncryptKey, body);
                    break;
                  case 'file': break;
                  case 'medical_request': rawText = `This application version doesn't support Medical Request`; break;
                  default: break;
                }

                body = body || '';
                const stanza = $msg({
                        // 'from': _converse.connection.jid.split('/')[0],
                        'from': _converse.connection.jid,
                        'to': this.get('jid'),
                        'type': this.get('message_type'),
                        'id':  message.get('msgid'),
                    }).c('body').t(body).up()
                      .c(_converse.ACTIVE, {'xmlns': Strophe.NS.CHATSTATES}).up();
                if (message.get('type') === 'chat' || message.get('type') === 'groupchat') {
                    stanza.c('data', {'xmlns': 'pageMe.message.data'})
                    .c('sentDate').t(sentDate).up()
                    .c('timeToRead').t(timeToRead).up();

                    if (message.get('type') === 'groupchat') {
                         stanza.c('senderName').t(_converse.user_settings.fullname).up();
                        stanza.c('senderJid').t(_converse.connection.jid.split('@')[0]).up(); //we set the jid of sender to stanza so we can get it later to render avatar
                    }
                    if (type === 'file') {
                      stanza.c('itemType').t(message.get('itemType')).up()
                      .c('mediaId').t(message.get('mediaId')).up()
                      .c('fileSize').t(message.get('fileSize')).up();
                    }
                    if (type === 'medical_request') {
                      stanza.c('itemType').t(message.get('itemType')).up()
                      .c('medialRequestKey').t(message.get('medialRequestKey')).up()
                      .c('subject').t(message.get('subject')).up()
                      .c('description').t(message.get('description')).up();
                    }
                    if (type === 'text') {
                      stanza.c('encrypted').t('1').up();
                    }
                    stanza.up();
                    stanza.c('request', {'xmlns': Strophe.NS.RECEIPTS}).up();
                }
                if (message.get('is_spoiler')) {
                    if (message.get('spoiler_hint')) {
                        stanza.c('spoiler', {'xmlns': Strophe.NS.SPOILER}, message.get('spoiler_hint')).up();
                    } else {
                        stanza.c('spoiler', {'xmlns': Strophe.NS.SPOILER}).up();
                    }
                }
                (message.get('references') || []).forEach(reference => {
                    const attrs = {
                        'xmlns': Strophe.NS.REFERENCE,
                        'begin': reference.begin,
                        'end': reference.end,
                        'type': reference.type,
                    }
                    if (reference.uri) {
                        attrs.uri = reference.uri;
                    }
                    stanza.c('reference', attrs).up();
                });

                if (message.get('oob_url')) {
                    stanza.c('x', {'xmlns': Strophe.NS.OUTOFBAND}).c('url').t(message.get('oob_url')).up();
                }
                if (message.get('edited')) {
                    stanza.c('replace', {
                        'xmlns': Strophe.NS.MESSAGE_CORRECT,
                        'id': message.get('msgid')
                    }).up();
                }
                if (!_converse.pagemeMessages) {
                  _converse.pagemeMessages = [];
                }
                _converse.pagemeMessages.push({
                  body: body,
                  decrypted: rawText,
                  sentDate: sentDate,
                  stanza: stanza.node
                })
                // _converse.api.emit('rerenderMessage');
                return stanza;
            },

            sendMessageStanza (stanza) {
                _converse.api.send(stanza);
                if (_converse.forward_messages) {
                    // Forward the message, so that other connected resources are also aware of it.
                    _converse.api.send(
                        $msg({
                            'to': _converse.bare_jid,
                            'type': this.get('message_type'),
                        }).c('forwarded', {'xmlns': Strophe.NS.FORWARD})
                            .c('delay', {
                                    'xmns': Strophe.NS.DELAY,
                                    'stamp': moment().format()
                            }).up()
                          .cnode(stanza.tree())
                    );
                }
                _converse.api.emit('rerenderMessage');
            },

            getOutgoingMessageAttributes (text, spoiler_hint) {
                const is_spoiler = this.get('composing_spoiler');
                return _.extend(this.toJSON(), {
                    'id': _converse.connection.getUniqueId(),
                    'fullname': _converse.xmppstatus.get('fullname'),
                    'from': _converse.bare_jid,
                    'sender': 'me',
                    'time': moment().format(),
                    'message': text ? u.httpToGeoUri(u.shortnameToUnicode(text), _converse) : undefined,
                    'is_spoiler': is_spoiler,
                    'spoiler_hint': is_spoiler ? spoiler_hint : undefined,
                    'type': this.get('message_type')
                });
            },

            sendMessage (attrs) {
                /* Responsible for sending off a text message.
                 *
                 *  Parameters:
                 *    (Message) message - The chat message
                 */
                attrs.sent = (new Date()).getTime() / 1000;
                // if (attrs.type === 'groupchat') {
                //     attrs.received = (new Date()).getTime() / 1000;
                // }
                const body = attrs.message;
                const mediaId = attrs.mediaId;
                const medialRequestKey = attrs.medialRequestKey;
                let message = this.messages.findWhere('correcting')
                if (message) {
                  const older_versions = message.get('older_versions') || [];
                  older_versions.push(message.get('message'));
                  message.save({
                      'correcting': false,
                      'edited': moment().format(),
                      'message': attrs.message,
                      'older_versions': older_versions,
                      'references': attrs.references
                  });
                } else {
                  delete attrs.message;
                  attrs['time_to_read'] = timeToRead;
                  message = this.messages.create(attrs);
                }
                let type = 'text';
                if (mediaId) {
                  type = 'file';
                }
                if (medialRequestKey) {
                  type = 'medical_request';
                }
                const time = attrs.time || attrs.sent;
                if (time) {
                    message.save('latestMessageTime', new Date(time));
                } else {
                    message.save('latestMessageTime', null);
                }
                return this.sendMessageStanza(this.createMessageStanza(message, type, body || mediaId || medialRequestKey));
            },

            sendChatState () {
                /* Sends a message with the status of the user in this chat session
                 * as taken from the 'chat_state' attribute of the chat box.
                 * See XEP-0085 Chat State Notifications.
                 */
                if (_converse.send_chat_state_notifications && this.get('chat_state')) {
                    _converse.api.send(
                        $msg({
                            'id': _converse.connection.getUniqueId(),
                            'to': this.get('jid'),
                            'type': 'chat'
                        }).c(this.get('chat_state'), {'xmlns': Strophe.NS.CHATSTATES}).up()
                          .c('no-store', {'xmlns': Strophe.NS.HINTS}).up()
                          .c('no-permanent-store', {'xmlns': Strophe.NS.HINTS})
                    );
                }
            },


            async sendFiles (files) {
                const result = await _converse.api.disco.supports(Strophe.NS.HTTPUPLOAD, _converse.domain),
                      item = result.pop();

                if (!item) {
                    this.messages.create({
                        'message': __("Sorry, looks like file upload is not supported by your server."),
                        'type': 'error'
                    });
                    return;
                }

                const data = item.dataforms.where({'FORM_TYPE': {'value': Strophe.NS.HTTPUPLOAD, 'type': "hidden"}}).pop(),
                      max_file_size = window.parseInt(_.get(data, 'attributes.max-file-size.value')),
                      slot_request_url = _.get(item, 'id');

                if (!slot_request_url) {
                    this.messages.create({
                        'message': __("Sorry, looks like file upload is not supported by your server."),
                        'type': 'error'
                    });
                    return;
                }
                _.each(files, (file) => {
                    if (!window.isNaN(max_file_size) && window.parseInt(file.size) > max_file_size) {
                        return this.messages.create({
                            'message': __('The size of your file, %1$s, exceeds the maximum allowed by your server, which is %2$s.',
                                file.name, filesize(max_file_size)),
                            'type': 'error'
                        });
                    } else {
                        const message = this.messages.create(
                            _.extend(
                                this.getOutgoingMessageAttributes(), {
                                'file': true,
                                'progress': 0,
                                'slot_request_url': slot_request_url
                            }), {'silent': true}
                        );
                        message.file = file;
                        this.messages.trigger('add', message);
                        message.getRequestSlotURL();
                    }
                });
            },

            getReferencesFromStanza (stanza) {
                const text = _.propertyOf(stanza.querySelector('body'))('textContent');
                return sizzle(`reference[xmlns="${Strophe.NS.REFERENCE}"]`, stanza).map(ref => {
                    const begin = ref.getAttribute('begin'),
                          end = ref.getAttribute('end');
                    return  {
                        'begin': begin,
                        'end': end,
                        'type': ref.getAttribute('type'),
                        'value': text.slice(begin, end),
                        'uri': ref.getAttribute('uri')
                    };
                });
            },

            getMessageAttributesFromStanza (stanza, original_stanza, extraAttrs) {
                /* Parses a passed in message stanza and returns an object
                 * of attributes.
                 *
                 * Parameters:
                 *    (XMLElement) stanza - The message stanza
                 *    (XMLElement) delay - The <delay> node from the
                 *      stanza, if there was one.
                 *    (XMLElement) original_stanza - The original stanza,
                 *      that contains the message stanza, if it was
                 *      contained, otherwise it's the message stanza itself.
                 */
                const archive = sizzle(`result[xmlns="${Strophe.NS.MAM}"]`, original_stanza).pop(),
                      spoiler = sizzle(`spoiler[xmlns="${Strophe.NS.SPOILER}"]`, original_stanza).pop(),
                      delay = sizzle(`delay[xmlns="${Strophe.NS.DELAY}"]`, original_stanza).pop(),
                      chat_state = stanza.getElementsByTagName(_converse.COMPOSING).length && _converse.COMPOSING ||
                            stanza.getElementsByTagName(_converse.PAUSED).length && _converse.PAUSED ||
                            stanza.getElementsByTagName(_converse.INACTIVE).length && _converse.INACTIVE ||
                            stanza.getElementsByTagName(_converse.ACTIVE).length && _converse.ACTIVE ||
                            stanza.getElementsByTagName(_converse.GONE).length && _converse.GONE,
                      sendDate = stanza.querySelector('sentDate') && stanza.querySelector('sentDate').innerHTML ?
                          moment(stanza.querySelector('sentDate').innerHTML * 1000).format() :
                          moment().format();;
                const attrs = {
                    'chat_state': chat_state,
                    'is_archived': !_.isNil(archive),
                    'is_delayed': !_.isNil(delay),
                    'is_spoiler': !_.isNil(spoiler),
                    'message': _converse.chatboxes.getMessageBody(stanza) || undefined,
                    'references': this.getReferencesFromStanza(stanza),
                    'msgid': stanza.getAttribute('id'),
                    'time': delay ? delay.getAttribute('stamp') : sendDate,
                    'time_to_read': stanza.querySelector('timeToRead') ? stanza.querySelector('timeToRead').innerHTML : 84000,

                    'itemType': stanza.querySelector('itemType') ? stanza.querySelector('itemType').innerHTML : '',
                    'fileSize': stanza.querySelector('fileSize') ? stanza.querySelector('fileSize').innerHTML : '',
                    'sent': sendDate,
                    'type': stanza.getAttribute('type')
                    // 'url': 'URL'
                };
                if (!extraAttrs) {
                  extraAttrs = {};
                }
                switch (attrs.itemType) {
                  case 'video':
                  case 'image':
                    extraAttrs = {
                      ...extraAttrs,
                      'mediaId': stanza.querySelector('mediaId') ? stanza.querySelector('mediaId').innerHTML : '',
                      'fileSize': stanza.querySelector('fileSize') ? stanza.querySelector('fileSize').innerHTML : '',
                    };
                    break;
                  case 'medical_request':
                    if (!extraAttrs.medReqStt) {
                      extraAttrs.medReqStt = 'IN_PROGRESS'
                    }
                    extraAttrs = {
                      ...extraAttrs,
                      'medialRequestKey': stanza.querySelector('medialRequestKey') ? stanza.querySelector('medialRequestKey').innerHTML : '',
                      'subject': stanza.querySelector('subject') ? stanza.querySelector('subject').innerHTML : '',
                      'description': stanza.querySelector('description') ? stanza.querySelector('description').innerHTML : ''
                    };
                    break;
                  default:
                    break;
                }
                Object.assign(attrs, extraAttrs);
                if (attrs.type === 'groupchat') {
                    attrs.from = stanza.getAttribute('from');
                    attrs.nick = Strophe.unescapeNode(Strophe.getResourceFromJid(attrs.from));
                    if (stanza.querySelector('data') && stanza.querySelector('data').querySelector('senderName')) {
                        attrs.senderName = stanza.querySelector('data').querySelector('senderName').textContent;
                    }
                    if (stanza.querySelector('data') && stanza.querySelector('data').querySelector('senderJid')) {
                        //if it has senderId, create attrs SenderJid for load avatar in chatview
                        attrs.senderJid = stanza.querySelector('data').querySelector('senderJid').innerHTML;
                    }
                    if (attrs.senderJid) {
                        attrs.sender = _converse.user_settings.jid.split('@')[0] === attrs.senderJid ? 'me': 'them';
                    } else {
                        attrs.sender = _converse.user_settings.jid.split('@')[0] === attrs.nick ? 'me' : 'them'
                    }
                } else {
                    attrs.from = Strophe.getBareJidFromJid(stanza.getAttribute('from'));
                    if (attrs.from === _converse.bare_jid) {
                        attrs.sender = 'me';
                        attrs.fullname = _converse.xmppstatus.get('fullname');
                    } else {
                        attrs.sender = 'them';
                        attrs.fullname = this.get('fullname');
                    }
                }
                _.each(sizzle(`x[xmlns="${Strophe.NS.OUTOFBAND}"]`, stanza), (xform) => {
                    attrs['oob_url'] = xform.querySelector('url').textContent;
                    attrs['oob_desc'] = xform.querySelector('url').textContent;
                });
                if (spoiler) {
                    attrs.spoiler_hint = spoiler.textContent.length > 0 ? spoiler.textContent : '';
                }
                return attrs;
            },

            createMessage (message, original_stanza, extraAttrs) {
                /* Create a Backbone.Message object inside this chat box
                 * based on the identified message stanza.
                 */
                const that = this;
                function _create (attrs) {
                    const is_csn = u.isOnlyChatStateNotification(attrs);
                    if (is_csn && (attrs.is_delayed ||
                            (attrs.type === 'groupchat' && Strophe.getResourceFromJid(attrs.from) == that.get('nick')))) {
                        // XXX: MUC leakage
                        // No need showing delayed or our own CSN messages
                        return;
                    } else if (!is_csn && !attrs.file && !attrs.plaintext && !attrs.message && !attrs.mediaId && !attrs.medialRequestKey && !attrs.oob_url && attrs.type !== 'error') {
                        // TODO: handle <subject> messages (currently being done by ChatRoom)
                        return;
                    } else {
                        if (attrs.message) {
                          const newPagemeMessage = {
                            body: attrs.message,
                            stanza: message
                          };
                          if (
                            message.getElementsByTagName('encrypted') &&
                            message.getElementsByTagName('encrypted')[0] &&
                            message.getElementsByTagName('encrypted')[0].firstChild &&
                            message.getElementsByTagName('encrypted')[0].firstChild.nodeValue === '1'
                          ) {
                            try {
                              newPagemeMessage.decrypted = RNCryptor.pagemeDecrypt(_converse.user_settings.pagemeEncryptKey, newPagemeMessage.body)
                            } catch(err) {
                              newPagemeMessage.decrypted = 'Howdy! This character is unsupported by end-to-end encryption';
                            }
                          } else {
                            newPagemeMessage.decrypted = newPagemeMessage.body;
                          }
                          if (!_converse.pagemeMessages) {
                            _converse.pagemeMessages = [];
                          }
                          _converse.pagemeMessages.push(newPagemeMessage)
                          delete attrs.message;
                        }
                        if (u.isOnlyChatStateNotification(attrs)) {
                        } else {
                          const receipt = sizzle(`received[xmlns="${Strophe.NS.RECEIPTS}"]`, original_stanza).pop();
                          if (receipt) {
                          } else if (!extraAttrs || !extraAttrs.silent) {
                            const time = attrs.time || attrs.sent;
                            if (time) {
                                that.save('latestMessageTime', new Date(time));
                            } else {
                                that.save('latestMessageTime', null);
                            }
                          }
                        }
                        const oldMessage = that.messages.findWhere({
                            'msgid' : attrs.msgid
                        });
                        if (oldMessage) {
                          return oldMessage.save(attrs);
                        } else {
                          return that.messages.create({
                            ...attrs
                          });
                        }
                    }
                }
                const result = this.getMessageAttributesFromStanza(message, original_stanza, extraAttrs)
                if (typeof result.then === "function") {
                    return new Promise((resolve, reject) => result.then(attrs => resolve(_create(attrs))));
                } else {
                    const message = _create(result);
                    return Promise.resolve(message);
                }
            },

            isHidden () {
                /* Returns a boolean to indicate whether a newly received
                 * message will be visible to the user or not.
                 */
                return this.get('hidden') ||
                    this.get('minimized') ||
                    this.isScrolledUp() ||
                    _converse.windowState === 'hidden';
            },

            incrementUnreadMsgCounter (message) {
                /* Given a newly received message, update the unread counter if
                 * necessary.
                 */

                if (!message) { return; }
                if (message.get('itemType') === "medical_request") {
                    _converse.emit('MedicalRequestReceived', message.get('medialRequestKey'));
                }
                // if (_.isNil(message.get('message'))) { return; }
                if (utils.isNewMessage(message) && this.isHidden()) {
                    this.save({'num_unread': this.get('num_unread') + 1});
                    _converse.incrementMsgCounter();
                }
            },

            clearUnreadMsgCounter () {
                u.safeSave(this, {'num_unread': 0});
            },

            isScrolledUp () {
                return this.get('scrolled', true);
            }
        });


        _converse.ChatBoxes = Backbone.Collection.extend({
            comparator: 'time_opened',

            model (attrs, options) {
                return new _converse.ChatBox(attrs, options);
            },

            registerMessageHandler () {
                _converse.connection.addHandler((stanza) => {
                    this.onMessage(stanza);
                    return true;
                }, null, 'message', 'chat');
                //special case for ios receipt
                _converse.connection.addHandler(stanza => {
                    const receipt = sizzle(`received[xmlns="${Strophe.NS.RECEIPTS}"]`, stanza).pop();
                    if (receipt) {
                      this.onMessage(stanza);
                    }
                    return true;
                }, null, 'message', null);
                _converse.connection.addHandler((stanza) => {
                    this.onErrorMessage(stanza);
                    return true;
                }, null, 'message', 'error');
            },

            chatBoxMayBeShown (chatbox) {
                return false;
            },

            onChatBoxesFetched (collection) {
                /* Show chat boxes upon receiving them from sessionStorage */
                collection.each((chatbox) => {
                    if (this.chatBoxMayBeShown(chatbox)) {
                        chatbox.trigger('show');
                    }
                });
                _converse.emit('chatBoxesFetched');
            },

            onConnected () {
                this.browserStorage = new Backbone.BrowserStorage.session(
                    `converse.chatboxes-${_converse.bare_jid}`);
                this.registerMessageHandler();
                this.fetch({
                    'add': true,
                    'success': this.onChatBoxesFetched.bind(this)
                });
            },

            onErrorMessage (message) {
                /* Handler method for all incoming error message stanzas
                */
                const from_jid =  Strophe.getBareJidFromJid(message.getAttribute('from'));
                if (utils.isSameBareJID(from_jid, _converse.bare_jid)) {
                    return true;
                }
                const chatbox = this.getChatBox(from_jid);
                if (!chatbox) {
                    return true;
                }
                const id = message.getAttribute('id');
                if (id) {
                    const msgs = chatbox.messages.where({'msgid': id});
                    if (!msgs.length || msgs.filter(m => m.get('type') === 'error').length) {
                        // If the error refers to a message not included in our store.
                        // We assume that this was a CSI message (which we don't store).
                        // See https://github.com/conversejs/converse.js/issues/1317
                        //
                        // We also ignore duplicate error messages.
                        return;
                    }
                } else {
                    // An error message without id likely means that we
                    // sent a message without id (which shouldn't happen).
                    _converse.log('Received an error message without id attribute!', Strophe.LogLevel.ERROR);
                    _converse.log(message, Strophe.LogLevel.ERROR);
                }
                chatbox.createMessage(message, message);
                return true;
            },

            getMessageBody (stanza) {
                /* Given a message stanza, return the text contained in its body.
                 */
                const type = stanza.getAttribute('type');
                if (type === 'error') {
                    const error = stanza.querySelector('error');
                    return _.propertyOf(error.querySelector('text'))('textContent') ||
                        __('Sorry, an error occurred:') + ' ' + error.innerHTML;
                } else {
                    return _.propertyOf(stanza.querySelector('body'))('textContent');
                }
            },

            sendReceiptStanza (to_jid, id) {
                const receipt_stanza = $msg({
                    'from': !_converse.connection.jid.indexOf('/pageme') ? _converse.connection.jid + '/pageme' : _converse.connection.jid,
                    'id': _converse.connection.getUniqueId(),
                    'to': to_jid.replace('/pageme', ''),
                    'type': 'chat'
                }).c('received', { 'xmlns': Strophe.NS.RECEIPTS, 'id': id }).up();
                _converse.api.send(receipt_stanza);
            },

            onMessage (stanza, extraAttrs) {
                /* Handler method for all incoming single-user chat "message"
                 * stanzas.
                 *
                 * Parameters:
                 *    (XMLElement) stanza       - The incoming message stanza
                 *    (Object)     extraAttrs   - Extra params received from pageme app
                 */
                let to_jid = stanza.getAttribute('to');
                const to_resource = Strophe.getResourceFromJid(to_jid);

                if (_converse.filter_by_resource && (to_resource && to_resource !== _converse.resource)) {
                    _converse.log(
                        `onMessage: Ignoring incoming message intended for a different resource: ${to_jid}`,
                        Strophe.LogLevel.INFO
                    );
                    return true;
                } else if (utils.isHeadlineMessage(_converse, stanza)) {
                    // XXX: Ideally we wouldn't have to check for headline
                    // messages, but Prosody sends headline messages with the
                    // wrong type ('chat'), so we need to filter them out here.
                    _converse.log(
                        `onMessage: Ignoring incoming headline message sent with type 'chat' from JID: ${stanza.getAttribute('from')}`,
                        Strophe.LogLevel.INFO
                    );
                    return true;
                }

                let from_jid = stanza.getAttribute('from');
                if (stanza.getAttribute('type') === 'groupchat') {
                  const to_jid_traited = to_jid.replace("/pageme", "");
                  from_jid = from_jid.replace(`/${to_jid_traited}`, '');
                }
                const forwarded = stanza.querySelector('forwarded'),
                      original_stanza = stanza;

                if (!_.isNull(forwarded)) {
                    const forwarded_message = forwarded.querySelector('message'),
                          forwarded_from = forwarded_message.getAttribute('from'),
                          is_carbon = !_.isNull(stanza.querySelector(`received[xmlns="${Strophe.NS.CARBONS}"]`));

                    if (is_carbon && Strophe.getBareJidFromJid(forwarded_from) !== from_jid) {
                        // Prevent message forging via carbons
                        // https://xmpp.org/extensions/xep-0280.html#security
                        return true;
                    }
                    stanza = forwarded_message;
                    from_jid = stanza.getAttribute('from');
                    to_jid = stanza.getAttribute('to');
                }
                const requests_receipt = !_.isUndefined(sizzle(`request[xmlns="${Strophe.NS.RECEIPTS}"]`, stanza).pop());
                if (requests_receipt) {
                    this.sendReceiptStanza(from_jid, stanza.getAttribute('id'));
                }

                const from_bare_jid = Strophe.getBareJidFromJid(from_jid),
                      from_resource = Strophe.getResourceFromJid(from_jid),
                      is_me =  from_bare_jid === _converse.bare_jid;

                let contact_jid;
                if (is_me ) {
                    // I am the sender, so this must be a forwarded message...
                    if (_.isNull(to_jid)) {
                        return _converse.log(
                            `Don't know how to handle message stanza without 'to' attribute. ${stanza.outerHTML}`,
                            Strophe.LogLevel.ERROR
                        );
                    }
                    contact_jid = Strophe.getBareJidFromJid(to_jid);
                } else {
                    contact_jid = from_bare_jid;
                }
                const attrs = {
                    'fullname': _.get(_converse.api.contacts.get(contact_jid), 'attributes.fullname')
                }
                let senderFullName = attrs.fullname;
                if (!attrs.fullname && !is_me && stanza.querySelector('received')) {
                    const that = this;
                    var ping = {
                        userName: `${contact_jid.split('@')[0]}`
                    };
                    var json = JSON.stringify(ping);

                    const has_body = sizzle(`body, encrypted[xmlns="${Strophe.NS.OMEMO}"]`).length > 0;
                    const chatbox = that.getChatBox(contact_jid, attrs, has_body);
                    if (chatbox && !chatbox.handleMessageCorrection(stanza) && !chatbox.handleReceipt(stanza)) {
                      const msgid = stanza.getAttribute('id'),
                          message = msgid && chatbox.messages.findWhere({
                              'msgid' : msgid
                          });
                      if (!message) {
                          // Only create the message when we're sure it's not a duplicate
                          chatbox.createMessage(stanza, original_stanza, extraAttrs)
                          .then(msg => {
                              chatbox.incrementUnreadMsgCounter(msg);
                              msg.set('senderFullName', senderFullName);
                          })
                          .catch(_.partial(_converse.log, _, Strophe.LogLevel.FATAL));
                      } else {
                          message.save(extraAttrs);
                          message.set('senderFullName', senderFullName)
                          _converse.emit('rerenderMessage');
                      }
                    }
                    _converse.emit('message', {
                          'stanza': original_stanza,
                          'chatbox': chatbox,
                          'silent': (extraAttrs || {}).silent
                        });
                } else {
                    const has_body = sizzle(`body, encrypted[xmlns="${Strophe.NS.OMEMO}"]`).length > 0;
                    const chatbox = this.getChatBox(contact_jid, attrs, has_body);
                    if (chatbox && !chatbox.handleMessageCorrection(stanza) && !chatbox.handleReceipt(stanza)) {
                      const msgid = stanza.getAttribute('id'),
                        message = msgid && chatbox.messages.findWhere({
                          'msgid' : msgid
                        });
                      if (!message) {
                        // Only create the message when we're sure it's not a duplicate
                        chatbox.createMessage(stanza, original_stanza, extraAttrs)
                          .then(msg => {

                                chatbox.incrementUnreadMsgCounter(msg);
                                msg.set('senderFullName', senderFullName)
                            //   }

                          })
                          .catch(_.partial(_converse.log, _, Strophe.LogLevel.FATAL));
                      } else {
                        message.save(extraAttrs);
                        message.set('senderFullName', senderFullName)
                        _converse.emit('rerenderMessage');
                      }
                    }
                    _converse.emit('message', {
                      'stanza': original_stanza,
                      'chatbox': chatbox,
                      'silent': (extraAttrs || {}).silent
                    });
                }

                return true;
            },

            getChatBox (jid, attrs={}, create) {
                /* Returns a chat box or optionally return a newly
                 * created one if one doesn't exist.
                 *
                 * Parameters:
                 *    (String) jid - The JID of the user whose chat box we want
                 *    (Boolean) create - Should a new chat box be created if none exists?
                 *    (Object) attrs - Optional chat box atributes.
                 */
                if (_.isObject(jid)) {
                    create = attrs;
                    attrs = jid;
                    jid = attrs.jid;
                }
                jid = Strophe.getBareJidFromJid(jid.toLowerCase());
                let  chatbox = this.get(Strophe.getBareJidFromJid(jid));
                if (!chatbox && create) {
                    _.extend(attrs, {'jid': jid, 'id': jid});
                    chatbox = this.create(attrs, {
                        'error' (model, response) {
                            _converse.log(response.responseText);
                        }
                    });
                }
                return chatbox;
            }
        });


        function autoJoinChats () {
            /* Automatically join private chats, based on the
             * "auto_join_private_chats" configuration setting.
             */
            _.each(_converse.auto_join_private_chats, function (jid) {
                if (_converse.chatboxes.where({'jid': jid}).length) {
                    return;
                }
                if (_.isString(jid)) {
                    _converse.api.chats.open(jid);
                } else {
                    _converse.log(
                        'Invalid jid criteria specified for "auto_join_private_chats"',
                        Strophe.LogLevel.ERROR);
                }
            });
            _converse.emit('privateChatsAutoJoined');
        }


        /************************ BEGIN Event Handlers ************************/
        _converse.on('chatBoxesFetched', autoJoinChats);


        _converse.api.waitUntil('rosterContactsFetched').then(() => {
            _converse.roster.on('add', (contact) => {
                /* When a new contact is added, check if we already have a
                 * chatbox open for it, and if so attach it to the chatbox.
                 */
                const chatbox = _converse.chatboxes.findWhere({'jid': contact.get('jid')});
                if (chatbox) {
                    chatbox.addRelatedContact(contact);
                }
            });
        });


        _converse.on('addClientFeatures', () => {
            _converse.api.disco.own.features.add(Strophe.NS.MESSAGE_CORRECT);
            _converse.api.disco.own.features.add(Strophe.NS.HTTPUPLOAD);
            _converse.api.disco.own.features.add(Strophe.NS.OUTOFBAND);
        });

        _converse.api.listen.on('pluginsInitialized', () => {
            _converse.chatboxes = new _converse.ChatBoxes();
            _converse.emit('chatBoxesInitialized');
        });

        _converse.api.listen.on('presencesInitialized', () => _converse.chatboxes.onConnected());
        /************************ END Event Handlers ************************/


        /************************ BEGIN API ************************/
        _.extend(_converse.api, {
            /**
             * The "chats" namespace (used for one-on-one chats)
             *
             * @namespace _converse.api.chats
             * @memberOf _converse.api
             */
            'chats': {
                /**
                 * @method _converse.api.chats.create
                 * @param {string|string[]} jid|jids An jid or array of jids
                 * @param {object} attrs An object containing configuration attributes.
                 */
                'create' (jids, attrs) {
                    if (_.isUndefined(jids)) {
                        _converse.log(
                            "chats.create: You need to provide at least one JID",
                            Strophe.LogLevel.ERROR
                        );
                        return null;
                    }
                    if (_.isString(jids)) {
                        if (attrs && !_.get(attrs, 'fullname')) {
                            attrs.fullname = _.get(_converse.api.contacts.get(jids), 'attributes.fullname');
                        }
                        const chatbox = _converse.chatboxes.getChatBox(jids, attrs, true);

                        if (_.isNil(chatbox)) {
                            _converse.log("Could not open chatbox for JID: "+jids, Strophe.LogLevel.ERROR);
                            return;
                        }
                        return chatbox;
                    }
                    return _.map(jids, (jid) => {
                        attrs.fullname = _.get(_converse.api.contacts.get(jid), 'attributes.fullname');
                        return _converse.chatboxes.getChatBox(jid, attrs, true).trigger('show');
                    });
                },

                /**
                 * Opens a new one-on-one chat.
                 *
                 * @method _converse.api.chats.open
                 * @param {String|string[]} name - e.g. 'buddy@example.com' or ['buddy1@example.com', 'buddy2@example.com']
                 * @returns {Promise} Promise which resolves with the Backbone.Model representing the chat.
                 *
                 * @example
                 * // To open a single chat, provide the JID of the contact you're chatting with in that chat:
                 * converse.plugins.add('myplugin', {
                 *     initialize: function() {
                 *         var _converse = this._converse;
                 *         // Note, buddy@example.org must be in your contacts roster!
                 *         _converse.api.chats.open('buddy@example.com').then((chat) => {
                 *             // Now you can do something with the chat model
                 *         });
                 *     }
                 * });
                 *
                 * @example
                 * // To open an array of chats, provide an array of JIDs:
                 * converse.plugins.add('myplugin', {
                 *     initialize: function () {
                 *         var _converse = this._converse;
                 *         // Note, these users must first be in your contacts roster!
                 *         _converse.api.chats.open(['buddy1@example.com', 'buddy2@example.com']).then((chats) => {
                 *             // Now you can do something with the chat models
                 *         });
                 *     }
                 * });
                 *
                 */
                'open' (jids, attrs) {
                    return new Promise((resolve, reject) => {
                        Promise.all([
                            _converse.api.waitUntil('rosterContactsFetched'),
                            _converse.api.waitUntil('chatBoxesFetched')
                        ]).then(() => {
                            if (_.isUndefined(jids)) {
                                const err_msg = "chats.open: You need to provide at least one JID";
                                _converse.log(err_msg, Strophe.LogLevel.ERROR);
                                reject(new Error(err_msg));
                            } else if (_.isString(jids)) {
                                resolve(_converse.api.chats.create(jids, attrs).trigger('show'));
                            } else {
                                resolve(_.map(jids, (jid) => _converse.api.chats.create(jid, attrs).trigger('show')));
                            }
                        }).catch(_.partial(_converse.log, _, Strophe.LogLevel.FATAL));
                    });
                },

                /**
                 * Returns a chat model. The chat should already be open.
                 *
                 * @method _converse.api.chats.get
                 * @param {String|string[]} name - e.g. 'buddy@example.com' or ['buddy1@example.com', 'buddy2@example.com']
                 * @returns {Backbone.Model}
                 *
                 * @example
                 * // To return a single chat, provide the JID of the contact you're chatting with in that chat:
                 * const model = _converse.api.chats.get('buddy@example.com');
                 *
                 * @example
                 * // To return an array of chats, provide an array of JIDs:
                 * const models = _converse.api.chats.get(['buddy1@example.com', 'buddy2@example.com']);
                 *
                 * @example
                 * // To return all open chats, call the method without any parameters::
                 * const models = _converse.api.chats.get();
                 *
                 */
                'get' (jids) {
                    if (_.isUndefined(jids)) {
                        const result = [];
                        _converse.chatboxes.each(function (chatbox) {
                            // FIXME: Leaky abstraction from MUC. We need to add a
                            // base type for chat boxes, and check for that.
                            if (chatbox.get('type') !== _converse.CHATROOMS_TYPE) {
                                result.push(chatbox);
                            }
                        });
                        return result;
                    } else if (_.isString(jids)) {
                        return _converse.chatboxes.getChatBox(jids);
                    }
                    return _.map(jids, _.partial(_converse.chatboxes.getChatBox.bind(_converse.chatboxes), _, {}, true));
                }
            }
        });
        /************************ END API ************************/
    }
});
