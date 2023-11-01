const { inspect } = require('util')

const TokenTypes = {
    Association: "ASSOCIATION",
    Connection: "CONNECTION",
    Name: "NAME",
    Pair: "PAIR",
    HashMap: "HASHMAP",
    Number: "NUMBER"
}

class Token {
    type = null
    data = null
    
    constructor(tokenType, tokenData) {
        this.type = tokenType
        this.data = tokenData
    }
}

const Association = (name, blockType) => {
    return {name, type: blockType}
}

const Connection = (origin, destination) => {
    return {origin, destination}
}
const Name = (name) => {
    return {name}
}
const Pair = (name, value) => {
    return {name, value}
}

const BLOCK_TYPES = {
    nor: 0,
    and: 1,
    or: 2,
    xor: 3,
    button: 4,
    flipflop: 5,
    led: 6,
    sound: 7,
    conductor: 8,
    custom: 9,
    nand: 10,
    xnor: 11,
    random: 12,
    text: 13,
    tile: 14
}
const TOKEN_REGEX = /(->|[\[\]{}()'`~^@\->]|"(?:\\.|[^\\"])*"?|;.*|[^\s\[\]{}('"`,;)\-\>]*)/g
const NUMBER_REGEX = /^-?\d+\.?\d*/
const RESERVED = ["as", "->", "{", "}", "(", ")"]
const HASHMAP_KEY_TYPES = [TokenTypes.Name, TokenTypes.Pair]
const ASSOCIATION_IDENTIFIER_TYPES = [TokenTypes.Name, TokenTypes.Pair]
const PAIRED_TYPES = [TokenTypes.Pair]
class Reader {
    tokens = []

    i = 0

    static tokenize(str) {
        return str.match(TOKEN_REGEX) || [];
    }

    constructor(content) {
        this.tokens = Reader.tokenize(content).filter(token => token.length != 0)
    }

    next() {
        let token = this.tokens[this.i] ?? null
        this.i++
        return token
    }
    
    peek() {
        return this.tokens[this.i] ?? null
    }

    read_paired_seq(close) {
        let token = null;
        let list = [];
        this.next();
        while((token = this.peek()) !== close) {
            if(token === null) {
                throw new SyntaxError(`Reached EOF before "${close}"`);
            }
            let k = this.read_name()
            if(k.type === TokenTypes.Pair) {
                list.push(k)
                continue
            }
            if(HASHMAP_KEY_TYPES.indexOf(k.type) == -1)
                throw new Error(`HashMap key type can only be ${HASHMAP_KEY_TYPES.join(' | ')}. Received ${k.type}`);
            k = k.data.name
            let v = this.read_name()
            list.push(new Token(TokenTypes.Pair, Pair(k, v)));
            if(this.peek() === close) {
                this.next()
                break
            }
        }  
        return list
    }

    read_hashmap() {
        const hashmap = new Token(TokenTypes.HashMap, this.read_paired_seq('}'));
        return hashmap;
    }

    read_name() {
        let token = this.next();
        if(RESERVED.indexOf(token) !== -1) throw new SyntaxError(`Unexpected "${token}" when expecting name`)
        const matchNumber = token.match(NUMBER_REGEX);
        if(matchNumber && matchNumber[0].length === token.length) return new Token(TokenTypes.Number, Number(token));
        
        let next = this.peek();
        switch(next) {
            case "{":
                return new Token(TokenTypes.Pair, Pair(token, this.read_hashmap()))
            default: 
                return new Token(TokenTypes.Name, Name(token));
        }
        
    }

    read_symbol() {
        let token = this.read_name();
        let next = this.next();
        if(next === null) {
            throw new SyntaxError(`Expected -> or "as" after symbol ${token}`)
        }
        switch(next) {
            case "->":
                let destination = this.read_name()
                return new Token(TokenTypes.Connection, Connection(token, destination))
            case "as":
                if(token.type !== TokenTypes.Name) {
                    throw new SyntaxError(`Unexpected ${token.type} "${token.data}" as identifier for "as"`)
                }
                let blockName = this.read_name()
                if(blockName === null) {
                    throw new SyntaxError('Expected symbol after "as"')
                }
                if(ASSOCIATION_IDENTIFIER_TYPES.indexOf(blockName.type) == -1) {
                    throw new Error(`Associaton identifier can only be type ${ASSOCIATION_IDENTIFIER_TYPES.join(' | ')}. Received ${blockName.type}`);
                }
                
                return new Token(TokenTypes.Association, Association(token, blockName))
            default:
                throw new SyntaxError(`Unexpected "${next}" after symbol "${token.data}"`)
        }
    }

    read_exp() {        
        let token = this.peek()
        switch(token) {
            case null:
                return null
            case "->":
                throw new SyntaxError("Unexpected -> at start of expression")
            case "as":
                throw new SyntaxError(`Unexpected reserved word "as" at start of expression`)
            default:
                return this.read_symbol()
        }
    }
}

let reader = new Reader(require('fs').readFileSync(process.argv[2], "utf8"))
console.log(reader.tokens)
let env = {}
let assocToIndex = {}
let connections = []
let exp
let assocIndex = 0
while((exp = reader.read_exp()) != null) {
    console.log(inspect(exp, true, 1e3, true))
    switch(exp.type) {
        case TokenTypes.Association:
            env[assocIndex] = exp.data
            assocToIndex[exp.data.name] = assocIndex+1
            assocIndex++
            break
        case TokenTypes.Connection:
            connections.push(exp.data)
            break
        default:
            console.log(`Unknown expression type ${exp.type}`)
            break
    }
}

let blocksOut = []
for(let [index, data] of Object.entries(env)) {
    index = parseInt(index)
    let {type} = data
    blocksOut[index] = `${BLOCK_TYPES[type]},0,${index},0,0,`
}
blocksOut = blocksOut.join(';')

let connectionsOut = []
for(const connection of connections) {
    connectionsOut.push(`${assocToIndex[connection.origin]},${assocToIndex[connection.destination]}`)
}
connectionsOut = connectionsOut.join(';')

let out = `${blocksOut}?${connectionsOut}??`

// console.log(out, assocToIndex, connections)